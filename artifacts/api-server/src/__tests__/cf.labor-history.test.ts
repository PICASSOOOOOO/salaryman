// LABOR HISTORY PRIVACY & CORRECTNESS — GET /api/cf/labor-history
//
// The endpoint merges two DB tables (cf_submissions + construction_labor_log)
// and must only return rows that belong to the authenticated user. A future
// query change that drops the userId/laborerId filter would silently expose
// another player's labor records. These tests lock down:
//
//   1. Auth guard      — unauthenticated requests are rejected with 401.
//   2. Isolation       — two users each see only their own rows, never the
//                        other user's records.
//   3. Merge           — both sources (cf_submissions with benefitingOrgId AND
//                        construction_labor_log with wasDebtor=true) surface in
//                        the merged `history` array.
//   4. totalPayoff sum — the reported total is the arithmetic sum of all
//                        individual payoff/reward values for that user.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  buildApp,
  actAs,
  setAuthed,
  makeUser,
  trackUser,
  seedCfSubmission,
  seedConstructionLabor,
  cleanupTestData,
} from "./helpers/cfTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  await cleanupTestData();
});

// ── 1. Auth guard ──────────────────────────────────────────────────────────

describe("GET /api/cf/labor-history — auth guard", () => {
  it("returns 401 when the request is not authenticated", async () => {
    const user = makeUser();
    trackUser(user);
    actAs(user);
    setAuthed(false);

    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(401);
    setAuthed(true);
  });
});

// ── 2. Isolation ────────────────────────────────────────────────────────────

describe("GET /api/cf/labor-history — user isolation", () => {
  it("returns only the authenticated user's cf_submissions rows, not another user's", async () => {
    const alice = makeUser();
    const bob = makeUser();
    trackUser(alice);
    trackUser(bob);

    // Bob has a cf_submission that Alice must NOT see.
    await seedCfSubmission({
      userId: bob.id,
      payoff: 500,
      benefitingOrgId: "org-bob",
      benefitingOrgName: "Bob Corp",
    });

    // Alice has her own submission.
    await seedCfSubmission({
      userId: alice.id,
      payoff: 300,
      benefitingOrgId: "org-alice",
      benefitingOrgName: "Alice Corp",
    });

    actAs(alice);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    const ids: string[] = res.body.history.map((e: { orgId: string }) => e.orgId);
    expect(ids).toContain("org-alice");
    expect(ids).not.toContain("org-bob");
  });

  it("returns only the authenticated user's construction_labor_log rows, not another user's", async () => {
    const carol = makeUser();
    const dave = makeUser();
    trackUser(carol);
    trackUser(dave);

    // Dave has a construction shift that Carol must NOT see.
    await seedConstructionLabor({
      laborerId: dave.id,
      reward: 200,
      benefitingOrgId: "org-dave",
      benefitingOrgName: "Dave Industries",
    });

    // Carol has her own construction shift.
    await seedConstructionLabor({
      laborerId: carol.id,
      reward: 400,
      benefitingOrgId: "org-carol",
      benefitingOrgName: "Carol Works",
    });

    actAs(carol);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    const ids: string[] = res.body.history.map((e: { orgId: string }) => e.orgId);
    expect(ids).toContain("org-carol");
    expect(ids).not.toContain("org-dave");
  });

  it("returns an empty history for a user who has no labor records", async () => {
    const newPlayer = makeUser();
    trackUser(newPlayer);
    actAs(newPlayer);

    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
    expect(res.body.totalPayoff).toBe(0);
    expect(res.body.count).toBe(0);
  });
});

// ── 3. Merge — both sources appear ─────────────────────────────────────────

describe("GET /api/cf/labor-history — source merging", () => {
  it("includes cf_submissions rows (source=task) in the history", async () => {
    const user = makeUser();
    trackUser(user);

    await seedCfSubmission({
      userId: user.id,
      kind: "build",
      payoff: 1500,
      benefitingOrgId: "org-merge-cf",
      benefitingOrgName: "Merge CF Org",
    });

    actAs(user);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    const taskEntries = res.body.history.filter(
      (e: { source: string }) => e.source === "task",
    );
    expect(taskEntries.length).toBeGreaterThanOrEqual(1);
    const entry = taskEntries.find(
      (e: { orgId: string }) => e.orgId === "org-merge-cf",
    );
    expect(entry).toBeDefined();
    expect(entry.kind).toBe("build");
  });

  it("includes construction_labor_log rows (source=construction) in the history", async () => {
    const user = makeUser();
    trackUser(user);

    await seedConstructionLabor({
      laborerId: user.id,
      reward: 200,
      benefitingOrgId: "org-merge-construction",
      benefitingOrgName: "Merge Construction Org",
    });

    actAs(user);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    const constructionEntries = res.body.history.filter(
      (e: { source: string }) => e.source === "construction",
    );
    expect(constructionEntries.length).toBeGreaterThanOrEqual(1);
    const entry = constructionEntries.find(
      (e: { orgId: string }) => e.orgId === "org-merge-construction",
    );
    expect(entry).toBeDefined();
    expect(entry.kind).toBe("construction");
  });

  it("merges both cf_submissions AND construction_labor_log into a single history array", async () => {
    const user = makeUser();
    trackUser(user);

    await seedCfSubmission({
      userId: user.id,
      kind: "build",
      payoff: 1000,
      benefitingOrgId: "org-both-cf",
    });

    await seedConstructionLabor({
      laborerId: user.id,
      reward: 200,
      benefitingOrgId: "org-both-construction",
    });

    actAs(user);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);

    const orgIds: string[] = res.body.history.map((e: { orgId: string }) => e.orgId);
    expect(orgIds).toContain("org-both-cf");
    expect(orgIds).toContain("org-both-construction");

    const sources = new Set(
      res.body.history.map((e: { source: string }) => e.source),
    );
    expect(sources.has("task")).toBe(true);
    expect(sources.has("construction")).toBe(true);
  });
});

// ── 4. totalPayoff sum ─────────────────────────────────────────────────────

describe("GET /api/cf/labor-history — totalPayoff", () => {
  it("reports the correct sum of all payoff values across both sources", async () => {
    const user = makeUser();
    trackUser(user);

    const cfPayoff = 1500;
    const constructionReward = 200;

    await seedCfSubmission({
      userId: user.id,
      kind: "bug",
      payoff: cfPayoff,
      benefitingOrgId: "org-sum-test",
    });

    await seedConstructionLabor({
      laborerId: user.id,
      reward: constructionReward,
      benefitingOrgId: "org-sum-test",
    });

    actAs(user);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    expect(res.body.totalPayoff).toBe(cfPayoff + constructionReward);
  });

  it("sums correctly across multiple entries of both kinds", async () => {
    const user = makeUser();
    trackUser(user);

    const payoffs = [500, 1500, 250];
    const rewards = [200, 400];

    for (const payoff of payoffs) {
      await seedCfSubmission({
        userId: user.id,
        payoff,
        benefitingOrgId: "org-multi-sum",
      });
    }
    for (const reward of rewards) {
      await seedConstructionLabor({
        laborerId: user.id,
        reward,
        benefitingOrgId: "org-multi-sum",
      });
    }

    const expected =
      payoffs.reduce((a, b) => a + b, 0) + rewards.reduce((a, b) => a + b, 0);

    actAs(user);
    const res = await request(app).get("/api/cf/labor-history");

    expect(res.status).toBe(200);
    expect(res.body.totalPayoff).toBe(expected);
    expect(res.body.count).toBe(payoffs.length + rewards.length);
  });
});
