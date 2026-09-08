import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// Mock the art-provider registry so no real apipass/fal/unreal calls happen.
// (Same shared-mockState pattern as the test-render suite.)
vi.mock("../lib/art-providers", async () =>
  (await import("./helpers/artProvidersMock")).makeArtProvidersMock(),
);
// The art routes are admin-only; treat the test user as an owner.
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: vi.fn(() => true),
}));

import request from "supertest";
import type { Express } from "express";
import { db, artAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  mockState,
  resetArtProvidersMock,
  NANO_ID,
  UNREAL_ID,
} from "./helpers/artProvidersMock";
import { buildApp, resetAuthState, cleanupTestData } from "./helpers/artTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(async () => {
  resetAuthState();
  resetArtProvidersMock();
  vi.clearAllMocks();
  // Start each test from a clean slate of throwaway rows.
  await cleanupTestData();
});
afterAll(async () => {
  await cleanupTestData();
});

/**
 * Insert a dynamic (non-kit) art row pinned to a given backend so we can drive
 * the kickoff() fallback branches through the regenerate route. We use the
 * "__test__" category (not a kit key) so cleanupTestData() removes it and the
 * regenerate route takes the dynamic-row path (no kit entry).
 */
async function insertDynamicRow(key: string, backend: string) {
  const [row] = await db
    .insert(artAssetsTable)
    .values({
      key,
      category: "__test__",
      subject: "fallback smoke test",
      prompt: "fallback smoke test prompt",
      aspectRatio: "1:1",
      backend,
      status: "pending",
    })
    .returning();
  return row;
}

describe("kickoff() backend fallback (POST /api/art/asset/:key/regenerate)", () => {
  it("falls back to the default backend when the chosen backend is unconfigured", async () => {
    // unreal is requested but unconfigured; nano (default) IS configured.
    mockState.configured[NANO_ID] = true;
    mockState.configured[UNREAL_ID] = false;

    const key = "__test__/dyn/fallback-unreal";
    await insertDynamicRow(key, UNREAL_ID);

    // No backend in the body -> regenerate keeps the row's existing "unreal"
    // backend, then kickoff() must transparently re-route to nano-banana.
    const res = await request(app)
      .post(`/api/art/asset/${encodeURIComponent(key)}/regenerate`)
      .send({});
    expect(res.status).toBe(200);

    // The returned row was reassigned to the default backend...
    expect(res.body.asset.backend).toBe(NANO_ID);
    // ...and the persisted row reflects that reassignment too.
    const [persisted] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, key));
    expect(persisted.backend).toBe(NANO_ID);

    // Exactly one job was started, and it ran on nano-banana — never unreal.
    expect(mockState.starts.length).toBe(1);
    expect(mockState.starts[0].id).toBe(NANO_ID);
    expect(mockState.starts.some((s) => s.id === UNREAL_ID)).toBe(false);

    // A real job handle was stored so polling can complete it.
    expect(persisted.taskId).toBeTruthy();
    expect(persisted.status).toBe("pending");
  });

  it("leaves the row untouched when NO backend is configured at all", async () => {
    // Neither the chosen backend nor the default is configured.
    mockState.configured[NANO_ID] = false;
    mockState.configured[UNREAL_ID] = false;

    const key = "__test__/dyn/fallback-none";
    await insertDynamicRow(key, UNREAL_ID);

    const res = await request(app)
      .post(`/api/art/asset/${encodeURIComponent(key)}/regenerate`)
      .send({});
    // No crash — the pipeline degrades gracefully.
    expect(res.status).toBe(200);

    // The row keeps its chosen backend (no silent reassignment) and no job ran.
    expect(res.body.asset.backend).toBe(UNREAL_ID);
    expect(mockState.starts.length).toBe(0);

    const [persisted] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, key));
    expect(persisted.backend).toBe(UNREAL_ID);
    // No job handle was minted and status was not promoted past pending.
    expect(persisted.taskId).toBeNull();
    expect(persisted.status).toBe("pending");
  });
});
