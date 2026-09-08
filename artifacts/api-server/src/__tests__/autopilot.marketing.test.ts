import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// The handler must perform its work through the SHARED social services, never by
// re-implementing logic. Mock those services so we can assert the handler's
// orchestration (gating → draft → publish → log) without real AI/provider calls.
// generateSocialCopy + publishSocialPost are stubbed; isSocialPlatform (used to
// read connected platforms) is kept real via importActual.
const { generateSocialCopyMock, publishSocialPostMock } = vi.hoisted(() => ({
  generateSocialCopyMock: vi.fn(),
  publishSocialPostMock: vi.fn(),
}));

vi.mock("../lib/social-service", async (importActual) => ({
  ...(await importActual<typeof import("../lib/social-service")>()),
  generateSocialCopy: generateSocialCopyMock,
  publishSocialPost: publishSocialPostMock,
}));
// Brand kit grounding hits the DB + object storage at import time — stub it out.
vi.mock("../lib/studio-gen", () => ({
  getBrandKit: vi.fn(async () => null),
  buildBrandContext: vi.fn(() => ""),
}));

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  socialPostsTable,
  platformConnectedAppsTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { marketingAutopilotHandler } from "../lib/autopilot/handlers/marketing";
import type { AutopilotContext } from "../lib/autopilot/types";

const OWNER_ID = `aptest-mkt-${randomUUID()}`;
let orgId: number;

// Build a fully-wired context with spy-able guardrails. Callers override the
// guardrail behaviour (e.g. ensureCredit → false) to exercise the blocked paths.
function makeCtx(overrides: Partial<AutopilotContext> = {}): {
  ctx: AutopilotContext;
  log: ReturnType<typeof vi.fn>;
  claimAction: ReturnType<typeof vi.fn>;
  ensureEntitlement: ReturnType<typeof vi.fn>;
  ensureCredit: ReturnType<typeof vi.fn>;
} {
  const log = (overrides.log as ReturnType<typeof vi.fn>) ?? vi.fn(async () => {});
  const claimAction = (overrides.claimAction as ReturnType<typeof vi.fn>) ?? vi.fn(() => true);
  const ensureEntitlement =
    (overrides.ensureEntitlement as ReturnType<typeof vi.fn>) ?? vi.fn(async () => true);
  const ensureCredit =
    (overrides.ensureCredit as ReturnType<typeof vi.fn>) ?? vi.fn(async () => true);
  const ctx = {
    orgId,
    domain: "marketing",
    config: {} as never,
    bot: { name: "Pablo" } as never,
    ownerId: OWNER_ID,
    ownerEmail: "owner@test",
    maxActions: 5,
    ...overrides,
    log,
    claimAction,
    ensureEntitlement,
    ensureCredit,
  } as unknown as AutopilotContext;
  return { ctx, log, claimAction, ensureEntitlement, ensureCredit };
}

async function draftCount(): Promise<number> {
  const rows = await db.select().from(socialPostsTable).where(eq(socialPostsTable.userId, OWNER_ID));
  return rows.length;
}

function logActions(log: ReturnType<typeof vi.fn>): string[] {
  return log.mock.calls.map((c) => (c[0] as { action: string }).action);
}

beforeAll(async () => {
  await db.insert(usersTable).values({ id: OWNER_ID, email: "owner@test" });
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Mkt Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: OWNER_ID })
    .returning({ id: organizationsTable.id });
  orgId = org.id;
});

beforeEach(async () => {
  vi.clearAllMocks();
  generateSocialCopyMock.mockResolvedValue({
    content: "Big news from the team!",
    hashtags: ["#news"],
    platform: "twitter",
  });
  publishSocialPostMock.mockResolvedValue({
    ok: true,
    post: {} as never,
    simulated: true,
    needsConnection: "twitter",
  });
  await db.delete(socialPostsTable).where(eq(socialPostsTable.userId, OWNER_ID));
  await db.delete(platformConnectedAppsTable).where(eq(platformConnectedAppsTable.orgId, String(orgId)));
});

afterAll(async () => {
  await db.delete(socialPostsTable).where(eq(socialPostsTable.userId, OWNER_ID));
  await db.delete(platformConnectedAppsTable).where(eq(platformConnectedAppsTable.orgId, String(orgId)));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
});

describe("marketingAutopilotHandler — gating", () => {
  it("does nothing when the per-tick action budget is spent", async () => {
    const { ctx, claimAction, ensureEntitlement } = makeCtx({ claimAction: vi.fn(() => false) });
    await marketingAutopilotHandler(ctx);
    expect(claimAction).toHaveBeenCalledTimes(1);
    // Must stop BEFORE checking entitlement / spending AI / drafting.
    expect(ensureEntitlement).not.toHaveBeenCalled();
    expect(generateSocialCopyMock).not.toHaveBeenCalled();
    expect(await draftCount()).toBe(0);
  });

  it("does nothing (no AI spend, no draft) when the owner lacks PRIME", async () => {
    const { ctx, ensureCredit } = makeCtx({ ensureEntitlement: vi.fn(async () => false) });
    await marketingAutopilotHandler(ctx);
    // Entitlement gate must run before the credit preflight and before drafting.
    expect(ensureCredit).not.toHaveBeenCalled();
    expect(generateSocialCopyMock).not.toHaveBeenCalled();
    expect(publishSocialPostMock).not.toHaveBeenCalled();
    expect(await draftCount()).toBe(0);
  });

  it("does nothing (no AI spend, no draft) when the credit preflight fails", async () => {
    const { ctx } = makeCtx({ ensureCredit: vi.fn(async () => false) });
    await marketingAutopilotHandler(ctx);
    expect(generateSocialCopyMock).not.toHaveBeenCalled();
    expect(publishSocialPostMock).not.toHaveBeenCalled();
    expect(await draftCount()).toBe(0);
  });
});

describe("marketingAutopilotHandler — drafting + publishing", () => {
  it("drafts an AI post and logs a simulated publish when not connected", async () => {
    publishSocialPostMock.mockResolvedValue({
      ok: true,
      post: {} as never,
      simulated: true,
      needsConnection: "twitter",
    });
    const { ctx, log } = makeCtx();
    await marketingAutopilotHandler(ctx);

    expect(generateSocialCopyMock).toHaveBeenCalledTimes(1);
    expect(publishSocialPostMock).toHaveBeenCalledTimes(1);

    // A real draft row lands in the same table the human's posts list reads.
    const rows = await db.select().from(socialPostsTable).where(eq(socialPostsTable.userId, OWNER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].aiGenerated).toBe("yes");
    expect(rows[0].status).toBe("draft");
    expect(rows[0].content).toBe("Big news from the team!");

    // Both the draft and the (simulated) publish are recorded to the activity log.
    expect(logActions(log)).toEqual(["draft_post", "publish_simulated"]);
  });

  it("drafts an AI post and logs a LIVE publish when PRIME + connected", async () => {
    publishSocialPostMock.mockResolvedValue({
      ok: true,
      post: {} as never,
      simulated: false,
      url: "http://live/post",
    });
    const { ctx, log } = makeCtx();
    await marketingAutopilotHandler(ctx);

    expect(await draftCount()).toBe(1);
    expect(logActions(log)).toEqual(["draft_post", "publish_live"]);
    const liveLog = log.mock.calls.find((c) => (c[0] as { action: string }).action === "publish_live");
    expect((liveLog?.[0] as { outcome: string }).outcome).toBe("success");
  });

  it("selects a platform configured only through Platform Connections", async () => {
    await db.insert(platformConnectedAppsTable).values({
      orgId: String(orgId),
      appSlug: "bluesky",
      appName: "Bluesky",
      status: "connected",
      config: { credentials: { login: "saved.bsky.social", password: "saved-app-password" } },
    });
    const { ctx } = makeCtx();

    await marketingAutopilotHandler(ctx);

    expect(generateSocialCopyMock).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "bluesky" }),
    );
    expect(publishSocialPostMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId }),
    );
  });

  it("logs publish_failed (and keeps the draft) when publishing errors", async () => {
    publishSocialPostMock.mockResolvedValue({ ok: false, status: 502, error: "boom" });
    const { ctx, log } = makeCtx();
    await marketingAutopilotHandler(ctx);

    // The draft was still created; only publishing failed.
    expect(await draftCount()).toBe(1);
    expect(logActions(log)).toEqual(["draft_post", "publish_failed"]);
  });

  it("skips drafting and logs generate_empty when the generator returns no copy", async () => {
    generateSocialCopyMock.mockResolvedValue({ content: "   ", hashtags: [], platform: "twitter" });
    const { ctx, log } = makeCtx();
    await marketingAutopilotHandler(ctx);

    expect(publishSocialPostMock).not.toHaveBeenCalled();
    expect(await draftCount()).toBe(0);
    expect(logActions(log)).toEqual(["generate_empty"]);
  });

  it("logs generate_failed (and drafts nothing) when generation throws", async () => {
    generateSocialCopyMock.mockRejectedValue(new Error("openai down"));
    const { ctx, log } = makeCtx();
    await marketingAutopilotHandler(ctx);

    expect(publishSocialPostMock).not.toHaveBeenCalled();
    expect(await draftCount()).toBe(0);
    expect(logActions(log)).toEqual(["generate_failed"]);
  });
});
