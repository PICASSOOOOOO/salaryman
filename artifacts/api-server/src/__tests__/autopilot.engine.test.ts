import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  autopilotConfigsTable,
  autopilotActivityLogTable,
  botsTable,
  organizationsTable,
  usersTable,
  type AutopilotDomain,
} from "@workspace/db";
import {
  runAutopilotTick,
  registerAutopilotHandler,
} from "../lib/autopilot/engine";
import type { AutopilotHandler } from "../lib/autopilot/types";

// The engine is the scheduler: each tick it finds enabled+due configs, clears the
// shared guardrails (real DB), claims the run slot, and invokes the registered
// domain handler. These tests drive runAutopilotTick against the REAL dev DB with
// real org/bot/owner rows so cadence gating, the reentrancy guard, the up-front
// lastRunAt claim, and per-handler error isolation are genuinely exercised.

const OWNER_ID = `aptest-engine-${randomUUID()}`;
const OWNER_EMAIL = `engine-${randomUUID().slice(0, 8)}@test`;
let orgId: number;
let botId: number;

// Restore the foundation no-op handlers between tests so a handler registered by
// one test can't leak into another.
const noop: AutopilotHandler = async () => {};
function resetHandlers() {
  for (const d of ["business_ops", "marketing", "crm_calls", "accounting"] as AutopilotDomain[]) {
    registerAutopilotHandler(d, noop);
  }
}

async function insertConfig(domain: AutopilotDomain, opts: { lastRunAt?: Date | null; cadenceMinutes?: number | null } = {}) {
  const [row] = await db
    .insert(autopilotConfigsTable)
    .values({
      orgId,
      domain,
      enabled: true,
      botId,
      cadenceMinutes: opts.cadenceMinutes ?? null,
      lastRunAt: opts.lastRunAt ?? null,
    })
    .returning();
  return row;
}

async function activityFor(domain: AutopilotDomain) {
  return db
    .select()
    .from(autopilotActivityLogTable)
    .where(and(eq(autopilotActivityLogTable.orgId, orgId), eq(autopilotActivityLogTable.domain, domain)));
}

beforeAll(async () => {
  await db.insert(usersTable).values({ id: OWNER_ID, email: OWNER_EMAIL });
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Engine Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: OWNER_ID })
    .returning({ id: organizationsTable.id });
  orgId = org.id;
  const [bot] = await db
    .insert(botsTable)
    .values({ ownerId: OWNER_ID, orgId, name: "Engine Bot" })
    .returning({ id: botsTable.id });
  botId = bot.id;
});

beforeEach(async () => {
  resetHandlers();
  await db.delete(autopilotConfigsTable).where(eq(autopilotConfigsTable.orgId, orgId));
  await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
});

afterAll(async () => {
  resetHandlers();
  await db.delete(autopilotConfigsTable).where(eq(autopilotConfigsTable.orgId, orgId));
  await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
  await db.delete(botsTable).where(eq(botsTable.id, botId));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
});

describe("runAutopilotTick — cadence gating", () => {
  it("runs a never-run config and skips one whose cadence has not elapsed", async () => {
    const ran: AutopilotDomain[] = [];
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId === orgId) ran.push("business_ops");
    });
    registerAutopilotHandler("marketing", async (ctx) => {
      if (ctx.orgId === orgId) ran.push("marketing");
    });

    await insertConfig("business_ops", { lastRunAt: null }); // due (never run)
    await insertConfig("marketing", { lastRunAt: new Date(), cadenceMinutes: 60 }); // just ran, not due

    await runAutopilotTick();

    expect(ran).toEqual(["business_ops"]);
  });

  it("runs a config once its cadence window has elapsed", async () => {
    let calls = 0;
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId === orgId) calls++;
    });
    // lastRunAt is two hours ago with a 60-minute cadence → due.
    await insertConfig("business_ops", { lastRunAt: new Date(Date.now() - 2 * 60 * 60_000), cadenceMinutes: 60 });

    await runAutopilotTick();
    expect(calls).toBe(1);
  });

  it("never runs a disabled config", async () => {
    let calls = 0;
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId === orgId) calls++;
    });
    await db
      .insert(autopilotConfigsTable)
      .values({ orgId, domain: "business_ops", enabled: false, botId, lastRunAt: null });

    await runAutopilotTick();
    expect(calls).toBe(0);
  });
});

describe("runAutopilotTick — run-slot claim", () => {
  it("claims lastRunAt BEFORE invoking the handler", async () => {
    let seenLastRunAt: Date | null | undefined;
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId !== orgId) return;
      const [row] = await db
        .select({ lastRunAt: autopilotConfigsTable.lastRunAt })
        .from(autopilotConfigsTable)
        .where(eq(autopilotConfigsTable.id, ctx.config.id));
      seenLastRunAt = row?.lastRunAt ?? null;
    });
    await insertConfig("business_ops", { lastRunAt: null });

    await runAutopilotTick();
    // The handler observed a non-null lastRunAt — proving the slot was claimed
    // up front, so a slow/failing handler cannot double-run on the next tick.
    expect(seenLastRunAt).toBeInstanceOf(Date);
  });
});

describe("runAutopilotTick — reentrancy guard", () => {
  it("does not overlap two evaluation passes", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId !== orgId) return;
      calls++;
      await gate; // hold the first pass open
    });
    await insertConfig("business_ops", { lastRunAt: null });

    const p1 = runAutopilotTick(); // sets the in-flight flag synchronously
    const p2 = runAutopilotTick(); // sees the flag → returns without a second pass
    release();
    await Promise.all([p1, p2]);

    expect(calls).toBe(1);
  });
});

describe("runAutopilotTick — handler isolation", () => {
  it("logs a thrown handler as an error without crashing the tick", async () => {
    registerAutopilotHandler("business_ops", async (ctx) => {
      if (ctx.orgId === orgId) throw new Error("handler boom");
    });
    // A second, healthy domain must still run in the same pass.
    let marketingRan = false;
    registerAutopilotHandler("marketing", async (ctx) => {
      if (ctx.orgId === orgId) marketingRan = true;
    });
    const failing = await insertConfig("business_ops", { lastRunAt: null });
    await insertConfig("marketing", { lastRunAt: null });

    await expect(runAutopilotTick()).resolves.toBeUndefined();

    // The throwing handler's failure is captured to the activity feed as an error.
    const log = await activityFor("business_ops");
    const errors = log.filter((r) => r.outcome === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].action).toBe("error");
    expect(errors[0].summary).toContain("handler boom");

    // The slot is still claimed despite the throw, and the other domain ran.
    const [row] = await db
      .select({ lastRunAt: autopilotConfigsTable.lastRunAt })
      .from(autopilotConfigsTable)
      .where(eq(autopilotConfigsTable.id, failing.id));
    expect(row.lastRunAt).toBeInstanceOf(Date);
    expect(marketingRan).toBe(true);
  });

  it("logs a blocked guardrail (bot reassigned away) instead of running the handler", async () => {
    let calls = 0;
    registerAutopilotHandler("crm_calls", async (ctx) => {
      if (ctx.orgId === orgId) calls++;
    });
    // Enabled + assigned, but the bot points at a non-existent bot id, so the
    // guardrail fails with bot_not_found.
    await db
      .insert(autopilotConfigsTable)
      .values({ orgId, domain: "crm_calls", enabled: true, botId: 1_999_999_999, lastRunAt: null });

    await runAutopilotTick();

    expect(calls).toBe(0);
    const log = await activityFor("crm_calls");
    const blocked = log.filter((r) => r.outcome === "blocked");
    expect(blocked.length).toBe(1);
    expect((blocked[0].detail as { reason?: string }).reason).toBe("bot_not_found");
  });
});
