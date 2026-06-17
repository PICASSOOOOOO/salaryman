import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// The shared guardrails are the gatekeeper every autopilot domain handler must
// clear. evaluateConfigGuardrails resolves the assigned bot + org owner against
// the REAL dev DB (so the org/bot/owner wiring is genuinely exercised).
// checkEntitlement mirrors the manual plan gate; checkCredit meters the assigned
// bot's BATTERY (owners exempt). We mock plan + battery so the pass/fail +
// error-swallowing paths are pinned without touching live billing/battery rows.
const { hasFeatureMock, isOwnerEmailMock, getPowerStatusMock, burnAiChargeMock } = vi.hoisted(() => ({
  hasFeatureMock: vi.fn(),
  isOwnerEmailMock: vi.fn(),
  getPowerStatusMock: vi.fn(),
  burnAiChargeMock: vi.fn(),
}));

vi.mock("../lib/plan", () => ({
  hasFeature: hasFeatureMock,
  isOwnerEmail: isOwnerEmailMock,
}));
vi.mock("../lib/battery", () => ({
  ACTIVE_SLOT: 0,
  getPowerStatus: getPowerStatusMock,
  burnAiCharge: burnAiChargeMock,
}));

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  botsTable,
  organizationsTable,
  usersTable,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  type AutopilotConfig,
} from "@workspace/db";
import {
  evaluateConfigGuardrails,
  checkEntitlement,
  checkCredit,
} from "../lib/autopilot/guardrails";

const OWNER_ID = `aptest-guard-${randomUUID()}`;
const OWNER_EMAIL = `guard-${randomUUID().slice(0, 8)}@test`;
let orgId: number;
let botId: number;
// A bot whose org points at a non-existent org id, to exercise the
// owner-fallback (org lookup misses → fall back to bot.ownerId).
let orphanOrgBotId: number;
const ORPHAN_ORG_ID = 2_000_000_000; // no organizations row will ever have this id

// Minimal AutopilotConfig builder — evaluateConfigGuardrails reads the config
// object directly (it does NOT need to be persisted), only the bot/org/user rows
// it points to must exist in the DB.
function cfg(overrides: Partial<AutopilotConfig>): AutopilotConfig {
  return {
    id: 1,
    orgId,
    domain: "marketing",
    enabled: true,
    botId,
    cadenceMinutes: null,
    maxActionsPerTick: null,
    budgetCapCents: null,
    lastRunAt: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AutopilotConfig;
}

beforeAll(async () => {
  await db.insert(usersTable).values({ id: OWNER_ID, email: OWNER_EMAIL });
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Guard Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: OWNER_ID })
    .returning({ id: organizationsTable.id });
  orgId = org.id;
  const [bot] = await db
    .insert(botsTable)
    .values({ ownerId: OWNER_ID, orgId, name: "Guard Bot" })
    .returning({ id: botsTable.id });
  botId = bot.id;
  const [orphan] = await db
    .insert(botsTable)
    .values({ ownerId: OWNER_ID, orgId: ORPHAN_ORG_ID, name: "Orphan Bot" })
    .returning({ id: botsTable.id });
  orphanOrgBotId = orphan.id;
});

afterAll(async () => {
  await db.delete(botsTable).where(eq(botsTable.id, botId));
  await db.delete(botsTable).where(eq(botsTable.id, orphanOrgBotId));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
});

describe("evaluateConfigGuardrails — failure reasons", () => {
  it("rejects a disabled domain", async () => {
    const r = await evaluateConfigGuardrails(cfg({ enabled: false }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(r).toEqual({ ok: false, reason: "domain_disabled" });
  });

  it("rejects an enabled-but-unassigned domain (no bot picked)", async () => {
    const r = await evaluateConfigGuardrails(cfg({ botId: null }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(r).toEqual({ ok: false, reason: "bot_unassigned" });
  });

  it("rejects when the assigned bot no longer exists", async () => {
    const r = await evaluateConfigGuardrails(cfg({ botId: 1_999_999_999 }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(r).toEqual({ ok: false, reason: "bot_not_found" });
  });

  it("rejects when the assigned bot belongs to a different org", async () => {
    // The bot exists but its orgId no longer matches the config's org.
    const r = await evaluateConfigGuardrails(cfg({ orgId: orgId + 7_654_321 }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(r).toEqual({ ok: false, reason: "bot_not_in_org" });
  });
});

describe("evaluateConfigGuardrails — owner + cap resolution", () => {
  it("resolves the org owner + email and the default cap on the happy path", async () => {
    const r = await evaluateConfigGuardrails(cfg({}), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.bot.id).toBe(botId);
    expect(r.ownerId).toBe(OWNER_ID);
    expect(r.ownerEmail).toBe(OWNER_EMAIL);
    expect(r.maxActions).toBe(AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
  });

  it("honours a per-config cap and clamps it into [0, 100]", async () => {
    const high = await evaluateConfigGuardrails(cfg({ maxActionsPerTick: 9999 }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(high.ok && high.maxActions).toBe(100);
    const neg = await evaluateConfigGuardrails(cfg({ maxActionsPerTick: -5 }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(neg.ok && neg.maxActions).toBe(0);
    const exact = await evaluateConfigGuardrails(cfg({ maxActionsPerTick: 12 }), AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);
    expect(exact.ok && exact.maxActions).toBe(12);
  });

  it("falls back to the bot's owner when the org row is missing", async () => {
    // Both config + bot point at an org id that has no organizations row, so the
    // org owner lookup misses and ownerId falls back to bot.ownerId.
    const r = await evaluateConfigGuardrails(
      cfg({ orgId: ORPHAN_ORG_ID, botId: orphanOrgBotId }),
      AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.ownerId).toBe(OWNER_ID); // bot.ownerId fallback
    expect(r.ownerEmail).toBe(OWNER_EMAIL);
  });
});

describe("checkEntitlement", () => {
  it("returns false (without calling the plan) when there is no owner", async () => {
    hasFeatureMock.mockClear();
    expect(await checkEntitlement("", null)).toBe(false);
    expect(hasFeatureMock).not.toHaveBeenCalled();
  });

  it("passes through the plan's answer and defaults the feature to claw_bot", async () => {
    hasFeatureMock.mockResolvedValueOnce(true);
    expect(await checkEntitlement(OWNER_ID, OWNER_EMAIL)).toBe(true);
    expect(hasFeatureMock).toHaveBeenCalledWith(OWNER_ID, OWNER_EMAIL, "claw_bot");
  });

  it("forwards a custom feature key", async () => {
    hasFeatureMock.mockResolvedValueOnce(false);
    expect(await checkEntitlement(OWNER_ID, OWNER_EMAIL, "phone_system")).toBe(false);
    expect(hasFeatureMock).toHaveBeenCalledWith(OWNER_ID, OWNER_EMAIL, "phone_system");
  });

  it("swallows a thrown plan check and returns false", async () => {
    hasFeatureMock.mockRejectedValueOnce(new Error("plan db down"));
    expect(await checkEntitlement(OWNER_ID, OWNER_EMAIL)).toBe(false);
  });
});

describe("checkCredit (bot battery)", () => {
  it("returns not-allowed with no_owner (without touching the battery) when there is no owner", async () => {
    getPowerStatusMock.mockClear();
    isOwnerEmailMock.mockReturnValue(false);
    expect(await checkCredit("", null, 1)).toEqual({ allowed: false, reason: "no_owner" });
    expect(getPowerStatusMock).not.toHaveBeenCalled();
  });

  it("exempts the owner (no battery check, no burn)", async () => {
    getPowerStatusMock.mockClear();
    burnAiChargeMock.mockClear();
    isOwnerEmailMock.mockReturnValue(true);
    expect(await checkCredit(OWNER_ID, OWNER_EMAIL, 1)).toEqual({ allowed: true });
    expect(getPowerStatusMock).not.toHaveBeenCalled();
    expect(burnAiChargeMock).not.toHaveBeenCalled();
  });

  it("rejects when no bot is assigned", async () => {
    isOwnerEmailMock.mockReturnValue(false);
    expect(await checkCredit(OWNER_ID, OWNER_EMAIL, null)).toEqual({ allowed: false, reason: "bot_unassigned" });
  });

  it("allows and burns a flat charge when the bot battery is powered", async () => {
    isOwnerEmailMock.mockReturnValue(false);
    burnAiChargeMock.mockClear();
    burnAiChargeMock.mockResolvedValueOnce({ ok: true, burned: 1, remaining: 5, seeded: false, replay: false });
    getPowerStatusMock.mockResolvedValueOnce({ charge: 6, capacity: 20, count: 1, powered: true, seedable: false });
    expect(await checkCredit(OWNER_ID, OWNER_EMAIL, 42)).toEqual({ allowed: true });
    expect(burnAiChargeMock).toHaveBeenCalledTimes(1);
    expect(burnAiChargeMock.mock.calls[0][0]).toMatchObject({ targetType: "bot", targetId: "42", kind: "bot" });
  });

  it("blocks when the bot battery is depleted (no burn)", async () => {
    isOwnerEmailMock.mockReturnValue(false);
    burnAiChargeMock.mockClear();
    getPowerStatusMock.mockResolvedValueOnce({ charge: 0, capacity: 20, count: 1, powered: false, seedable: false });
    expect(await checkCredit(OWNER_ID, OWNER_EMAIL, 42)).toEqual({ allowed: false, reason: "bot_battery_depleted" });
    expect(burnAiChargeMock).not.toHaveBeenCalled();
  });

  it("falls back to ALLOW when the battery preflight throws", async () => {
    isOwnerEmailMock.mockReturnValue(false);
    getPowerStatusMock.mockRejectedValueOnce(new Error("battery db down"));
    expect(await checkCredit(OWNER_ID, OWNER_EMAIL, 42)).toEqual({ allowed: true, reason: "credit_check_error" });
  });
});
