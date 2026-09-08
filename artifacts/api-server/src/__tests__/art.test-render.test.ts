import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// Mock the art-provider registry so no real apipass/fal/unreal calls happen.
// (Same shared-mockState pattern as the twilio suite.)
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
  FAL_ID,
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
  // Start each test from a clean slate of throwaway smoke-test rows.
  await cleanupTestData();
});
afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/art/test-render", () => {
  it("403 when the caller is not an admin", async () => {
    resetAuthState();
    const { authState } = await import("./helpers/artTestApp");
    authState.user = { id: "nobody", email: "not-owner@example.test" };
    const planMock = await import("../lib/plan");
    (planMock.isOwnerEmail as any).mockReturnValueOnce(false);
    const res = await request(app).post("/api/art/test-render").send({ backend: NANO_ID });
    expect(res.status).toBe(403);
  });

  it("returns { configured:false, jobs:[] } and fires NO jobs for an unconfigured backend", async () => {
    // fal is not configured by default.
    expect(mockState.configured[FAL_ID]).toBe(false);
    const res = await request(app).post("/api/art/test-render").send({ backend: FAL_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ backend: FAL_ID, configured: false, jobs: [] });
    // No generation jobs were kicked off at all.
    expect(mockState.starts.length).toBe(0);
    // And nothing was written to the DB for that backend.
    const rows = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.category, "__test__"));
    expect(rows.length).toBe(0);
  });

  it("does NOT silently fall back to Nano Banana when the chosen backend is unconfigured", async () => {
    // Configure the default (nano) but request the unconfigured unreal backend.
    mockState.configured[NANO_ID] = true;
    mockState.configured[UNREAL_ID] = false;
    const res = await request(app).post("/api/art/test-render").send({ backend: UNREAL_ID });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.jobs).toEqual([]);
    // Crucially: nano-banana was NOT used as a fallback.
    expect(mockState.starts.some((s) => s.id === NANO_ID)).toBe(false);
    expect(mockState.starts.length).toBe(0);
  });

  it("fires all three job types (object/landscape/cinematic) pinned to the configured backend", async () => {
    // Configure fal AND nano so we can prove the chosen backend (fal) is pinned
    // and nano is never substituted.
    mockState.configured[FAL_ID] = true;
    mockState.configured[NANO_ID] = true;
    const res = await request(app).post("/api/art/test-render").send({ backend: FAL_ID });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.backend).toBe(FAL_ID);
    expect(res.body.jobs.length).toBe(3);

    const jobTypes = res.body.jobs.map((j: { jobType: string }) => j.jobType).sort();
    expect(jobTypes).toEqual(["cinematic", "landscape", "object"]);

    // Every returned job row is pinned to the chosen backend.
    for (const j of res.body.jobs) {
      expect(j.asset.backend).toBe(FAL_ID);
      expect(j.asset.category).toBe("__test__");
    }

    // Exactly three start() calls, all against fal — never nano-banana.
    expect(mockState.starts.length).toBe(3);
    expect(mockState.starts.every((s) => s.id === FAL_ID)).toBe(true);
    expect(mockState.starts.map((s) => s.req.jobType).sort()).toEqual([
      "cinematic",
      "landscape",
      "object",
    ]);
  });

  it("defaults to the default backend when none is supplied", async () => {
    mockState.configured[NANO_ID] = true;
    const res = await request(app).post("/api/art/test-render").send({});
    expect(res.status).toBe(200);
    expect(res.body.backend).toBe(NANO_ID);
    expect(res.body.configured).toBe(true);
    expect(res.body.jobs.length).toBe(3);
    expect(mockState.starts.every((s) => s.id === NANO_ID)).toBe(true);
  });

  it("re-running reuses the same rows instead of piling up duplicates", async () => {
    mockState.configured[FAL_ID] = true;
    await request(app).post("/api/art/test-render").send({ backend: FAL_ID });
    await request(app).post("/api/art/test-render").send({ backend: FAL_ID });
    const rows = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.category, "__test__"));
    // 3 stable keys (one per job type) for the fal backend, not 6.
    expect(rows.length).toBe(3);
  });
});

describe("GET /api/art/providers", () => {
  it("403 when the caller is not an admin", async () => {
    const { authState } = await import("./helpers/artTestApp");
    authState.user = { id: "nobody", email: "not-owner@example.test" };
    const planMock = await import("../lib/plan");
    (planMock.isOwnerEmail as any).mockReturnValueOnce(false);
    const res = await request(app).get("/api/art/providers").send();
    expect(res.status).toBe(403);
  });

  it("returns provider summaries with live health and uses the cache by default", async () => {
    const res = await request(app).get("/api/art/providers").send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.providers.some((p: { id: string }) => p.id === NANO_ID)).toBe(true);
    // First load probes the one configured backend (nano) once.
    expect(mockState.probeCount).toBe(1);
    expect(mockState.cacheCleared).toBe(false);

    // A second default load is served entirely from cache — no new probe.
    await request(app).get("/api/art/providers").send();
    expect(mockState.probeCount).toBe(1);
    expect(mockState.cacheCleared).toBe(false);
  });

  it("?fresh=1 clears the health cache and forces a live re-probe", async () => {
    // Warm the cache.
    await request(app).get("/api/art/providers").send();
    expect(mockState.probeCount).toBe(1);

    // fresh=1 clears the cache then re-probes the configured backend.
    const res = await request(app).get("/api/art/providers?fresh=1").send();
    expect(res.status).toBe(200);
    expect(mockState.cacheCleared).toBe(true);
    expect(mockState.probeCount).toBe(2);
  });

  it("?fresh=true is also accepted as the bypass flag", async () => {
    await request(app).get("/api/art/providers").send();
    expect(mockState.probeCount).toBe(1);
    await request(app).get("/api/art/providers?fresh=true").send();
    expect(mockState.cacheCleared).toBe(true);
    expect(mockState.probeCount).toBe(2);
  });

  it("an arbitrary fresh value does NOT bypass the cache", async () => {
    await request(app).get("/api/art/providers").send();
    expect(mockState.probeCount).toBe(1);
    // fresh=0 / fresh=yes are not the documented flags — stay on the cache.
    await request(app).get("/api/art/providers?fresh=0").send();
    expect(mockState.cacheCleared).toBe(false);
    expect(mockState.probeCount).toBe(1);
  });

  it("reflects a backend that just came online when refreshed live", async () => {
    // unreal is offline and configured for this scenario.
    mockState.configured[UNREAL_ID] = true;
    mockState.health[UNREAL_ID] = "offline";
    let res = await request(app).get("/api/art/providers").send();
    let unreal = res.body.providers.find((p: { id: string }) => p.id === UNREAL_ID);
    expect(unreal.health).toBe("offline");

    // Admin brings the node online; a cached load still shows stale "offline".
    mockState.health[UNREAL_ID] = "online";
    res = await request(app).get("/api/art/providers").send();
    unreal = res.body.providers.find((p: { id: string }) => p.id === UNREAL_ID);
    expect(unreal.health).toBe("offline");

    // The Refresh status path (fresh=1) re-probes and reports it online.
    res = await request(app).get("/api/art/providers?fresh=1").send();
    unreal = res.body.providers.find((p: { id: string }) => p.id === UNREAL_ID);
    expect(unreal.health).toBe("online");
  });
});

describe("GET /api/art/library", () => {
  it("excludes the __test__ category rows from the grid", async () => {
    // Create a throwaway smoke-test row directly.
    const testKey = "__test__/fal/object";
    await db
      .insert(artAssetsTable)
      .values({
        key: testKey,
        category: "__test__",
        subject: "smoke test",
        prompt: "smoke test",
        aspectRatio: "1:1",
        backend: FAL_ID,
        jobType: "object",
        status: "pending",
      })
      .onConflictDoNothing();

    const res = await request(app).get("/api/art/library").send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.assets)).toBe(true);
    // No asset in the library carries the throwaway category...
    expect(res.body.assets.some((a: { category: string }) => a.category === "__test__")).toBe(false);
    // ...and our specific test row is absent.
    expect(res.body.assets.some((a: { key: string }) => a.key === testKey)).toBe(false);
  });
});
