import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("../lib/art-providers", async () =>
  (await import("./helpers/artProvidersMock")).makeArtProvidersMock(),
);
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: vi.fn(() => true),
}));

import request from "supertest";
import type { Express } from "express";
import { db, artAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { mockState, resetArtProvidersMock } from "./helpers/artProvidersMock";
import { buildApp, resetAuthState, cleanupTestData } from "./helpers/artTestApp";
import {
  shouldRetryFailedAsset,
  FAILED_RETRY_COOLDOWN_MS,
} from "../routes/art-assets";
import type { ArtAsset } from "@workspace/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ArtAsset stub for the pure-function tests. */
function makeAsset(overrides: Partial<ArtAsset> = {}): ArtAsset {
  return {
    id: 1,
    key: "test/stub",
    category: "test",
    subject: "test subject",
    prompt: "test prompt",
    aspectRatio: "1:1",
    status: "failed",
    url: null,
    taskId: null,
    backendMeta: null,
    failMsg: null,
    backend: "nano-banana",
    jobType: null,
    mediaType: "image",
    updatedAt: new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS - 1000),
    createdAt: new Date(0),
    ...overrides,
  } as unknown as ArtAsset;
}

/** Insert a `failed` art row with a controlled updatedAt into the test DB. */
async function insertFailedRow(key: string, updatedAt: Date) {
  const [row] = await db
    .insert(artAssetsTable)
    .values({
      key,
      category: "__test__",
      subject: "self-heal test",
      prompt: "self-heal test prompt",
      aspectRatio: "1:1",
      backend: "nano-banana",
      status: "failed",
      failMsg: "backend was unreachable",
      updatedAt,
    })
    .returning();
  return row;
}

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  resetAuthState();
  resetArtProvidersMock();
  vi.clearAllMocks();
  await cleanupTestData();
});
afterAll(async () => {
  await cleanupTestData();
});

// ---------------------------------------------------------------------------
// Unit: shouldRetryFailedAsset
// ---------------------------------------------------------------------------

describe("shouldRetryFailedAsset (cooldown gate)", () => {
  it("returns false for an asset that is not failed (pending)", () => {
    expect(shouldRetryFailedAsset(makeAsset({ status: "pending" }))).toBe(false);
  });

  it("returns false for an asset that is not failed (ready)", () => {
    expect(shouldRetryFailedAsset(makeAsset({ status: "ready" }))).toBe(false);
  });

  it("returns false for a failed asset that already has a URL (recovered externally)", () => {
    // A URL means the backend already delivered art; no re-kickoff needed.
    expect(
      shouldRetryFailedAsset(
        makeAsset({ status: "failed", url: "https://cdn.example.com/img.png" }),
      ),
    ).toBe(false);
  });

  it("returns false within the cooldown window (backend still cooling down)", () => {
    const recentFailure = new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS + 30_000);
    expect(shouldRetryFailedAsset(makeAsset({ updatedAt: recentFailure }))).toBe(false);
  });

  it("returns false for a failure that happened just NOW (0ms elapsed)", () => {
    expect(shouldRetryFailedAsset(makeAsset({ updatedAt: new Date() }))).toBe(false);
  });

  it("returns true exactly at the cooldown boundary (elapsed === FAILED_RETRY_COOLDOWN_MS)", () => {
    const exactBoundary = new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS);
    expect(shouldRetryFailedAsset(makeAsset({ updatedAt: exactBoundary }))).toBe(true);
  });

  it("returns true after the cooldown has fully elapsed", () => {
    const oldFailure = new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS - 5_000);
    expect(shouldRetryFailedAsset(makeAsset({ updatedAt: oldFailure }))).toBe(true);
  });

  it("returns true when updatedAt is null (gives benefit of the doubt — allow self-heal)", () => {
    // A null updatedAt means we have no timestamp to enforce the cooldown against;
    // the safe choice is to allow the retry rather than leave the asset permanently blank.
    expect(shouldRetryFailedAsset(makeAsset({ updatedAt: null as unknown as Date }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: GET /api/art/asset/:key self-heal via HTTP
// ---------------------------------------------------------------------------

describe("GET /api/art/asset/:key self-heal cooldown (integration)", () => {
  it("always returns 200 for a failed asset regardless of cooldown state", async () => {
    const key = "__test__/self-heal/always-200";
    const recentFailure = new Date(Date.now() - 10_000); // well within cooldown
    await insertFailedRow(key, recentFailure);

    const res = await request(app).get(`/api/art/asset/${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);
    expect(res.body.asset).toBeDefined();
    expect(res.body.asset.status).toBe("failed");
  });

  it("does NOT re-kickoff a failed asset that is still within the cooldown window", async () => {
    mockState.configured["nano-banana"] = true;

    const key = "__test__/self-heal/within-cooldown";
    const recentFailure = new Date(Date.now() - 60_000); // 1 minute ago < 3 minute cooldown
    await insertFailedRow(key, recentFailure);

    const res = await request(app).get(`/api/art/asset/${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);

    // No new generation job must have been started.
    expect(mockState.starts).toHaveLength(0);

    // The row must remain in failed state — kickoff was skipped.
    const [persisted] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, key));
    expect(persisted.status).toBe("failed");
    expect(persisted.taskId).toBeNull();
  });

  it("re-kickoffs a failed asset once the cooldown window has elapsed", async () => {
    mockState.configured["nano-banana"] = true;

    const key = "__test__/self-heal/after-cooldown";
    const oldFailure = new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS - 5_000);
    await insertFailedRow(key, oldFailure);

    const res = await request(app).get(`/api/art/asset/${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);

    // A generation job must have been started on the default provider.
    expect(mockState.starts).toHaveLength(1);
    expect(mockState.starts[0].id).toBe("nano-banana");

    // The row must now be pending (kickoff in progress).
    const [persisted] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, key));
    expect(persisted.status).toBe("pending");
    expect(persisted.taskId).toBeTruthy();
  });

  it("returns 200 for both an in-cooldown and an elapsed-cooldown asset in the same test run", async () => {
    mockState.configured["nano-banana"] = true;

    const keyFresh = "__test__/self-heal/fresh-fail";
    const keyOld = "__test__/self-heal/old-fail";

    const fresh = new Date(Date.now() - 30_000); // 30s ago — inside cooldown
    const old = new Date(Date.now() - FAILED_RETRY_COOLDOWN_MS - 10_000); // past cooldown

    await insertFailedRow(keyFresh, fresh);
    await insertFailedRow(keyOld, old);

    const [resFresh, resOld] = await Promise.all([
      request(app).get(`/api/art/asset/${encodeURIComponent(keyFresh)}`),
      request(app).get(`/api/art/asset/${encodeURIComponent(keyOld)}`),
    ]);

    expect(resFresh.status).toBe(200);
    expect(resOld.status).toBe(200);

    // Only the old (past-cooldown) asset should have triggered a kickoff.
    expect(mockState.starts).toHaveLength(1);
    expect(mockState.starts[0].id).toBe("nano-banana");
  });
});
