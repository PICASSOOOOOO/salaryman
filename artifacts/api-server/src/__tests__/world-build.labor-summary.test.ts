import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

// The labor-summary endpoint gates non-org plans (Pablo plans) behind the
// global admin check. We mock isOwnerEmail so the test user is treated as an
// admin and can read any plan's breakdown.
const mocks = vi.hoisted(() => ({ isOwnerEmail: vi.fn(() => true) }));
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  isOwnerEmail: mocks.isOwnerEmail,
}));

import {
  buildApp,
  seedPlan,
  seedContribution,
  seedUser,
  resetAuthState,
  cleanupTestData,
  authState,
} from "./helpers/worldBuildTestApp";

// This suite guards GET /api/world-build/plans/:id/labor-summary, which the
// expanded Plans-tab panel fetches on expand. Besides the aggregate totals it
// now returns a paginated per-laborer breakdown (laborerId, displayName,
// shifts, totalReward, lastShiftAt) mirroring the construction endpoint.

const app = buildApp();

beforeEach(async () => {
  resetAuthState();
  mocks.isOwnerEmail.mockReturnValue(true);
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/world-build/plans/:id/labor-summary", () => {
  it("returns aggregate totals plus a per-laborer breakdown", async () => {
    const planId = await seedPlan();
    await seedUser({ id: "wb-debtor-a", username: "alpha" });
    await seedUser({ id: "wb-debtor-b", firstName: "Bravo" });

    await seedContribution({ planId, userId: "wb-debtor-a", payoff: 200 });
    await seedContribution({ planId, userId: "wb-debtor-a", payoff: 150 });
    await seedContribution({ planId, userId: "wb-debtor-b", payoff: 100 });

    const res = await request(app).get(`/api/world-build/plans/${planId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.planId).toBe(planId);
    expect(res.body.debtorShifts).toBe(3);
    expect(res.body.totalDebtForgiven).toBe(450);
    expect(res.body.totalDebtorLaborers).toBe(2);
    expect(Array.isArray(res.body.laborers)).toBe(true);
    expect(res.body.laborers).toHaveLength(2);

    const byId: Record<string, { displayName: string; shifts: number; totalReward: number }> = {};
    for (const r of res.body.laborers) byId[r.laborerId] = r;
    expect(byId["wb-debtor-a"].shifts).toBe(2);
    expect(byId["wb-debtor-a"].totalReward).toBe(350);
    expect(byId["wb-debtor-a"].displayName).toBe("@alpha");
    expect(byId["wb-debtor-b"].shifts).toBe(1);
    expect(byId["wb-debtor-b"].totalReward).toBe(100);
    expect(byId["wb-debtor-b"].displayName).toBe("Bravo");
  });

  it("returns zeroed totals and an empty breakdown for a plan with no shifts", async () => {
    const planId = await seedPlan();
    const res = await request(app).get(`/api/world-build/plans/${planId}/labor-summary`);
    expect(res.status).toBe(200);
    expect(res.body.debtorShifts).toBe(0);
    expect(res.body.totalDebtForgiven).toBe(0);
    expect(res.body.totalDebtorLaborers).toBe(0);
    expect(res.body.laborers).toEqual([]);
    expect(res.body.totalPages).toBe(1);
  });

  it("paginates the per-laborer breakdown", async () => {
    const planId = await seedPlan();
    // Three distinct laborers; limit=2 should yield 2 pages.
    for (const id of ["wb-p-1", "wb-p-2", "wb-p-3"]) {
      await seedUser({ id, username: id });
      await seedContribution({ planId, userId: id, payoff: 100 });
    }

    const page1 = await request(app).get(`/api/world-build/plans/${planId}/labor-summary?page=1&limit=2`);
    expect(page1.status).toBe(200);
    expect(page1.body.totalDebtorLaborers).toBe(3);
    expect(page1.body.totalPages).toBe(2);
    expect(page1.body.page).toBe(1);
    expect(page1.body.laborers).toHaveLength(2);

    const page2 = await request(app).get(`/api/world-build/plans/${planId}/labor-summary?page=2&limit=2`);
    expect(page2.status).toBe(200);
    expect(page2.body.page).toBe(2);
    expect(page2.body.laborers).toHaveLength(1);
  });

  it("falls back to an anonymized name when no user row exists", async () => {
    const planId = await seedPlan();
    await seedContribution({ planId, userId: "wb-ghost-abc123", payoff: 100 });
    const res = await request(app).get(`/api/world-build/plans/${planId}/labor-summary`);
    expect(res.status).toBe(200);
    expect(res.body.laborers).toHaveLength(1);
    expect(res.body.laborers[0].displayName).toBe("INMATE-ABC123");
  });

  it("requires authentication (401)", async () => {
    const planId = await seedPlan();
    authState.authed = false;
    const res = await request(app).get(`/api/world-build/plans/${planId}/labor-summary`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a non-existent plan", async () => {
    const res = await request(app).get(`/api/world-build/plans/999999999/labor-summary`);
    expect(res.status).toBe(404);
  });

  it("rejects an invalid plan id (400)", async () => {
    const res = await request(app).get(`/api/world-build/plans/not-a-number/labor-summary`);
    expect(res.status).toBe(400);
  });

  it("forbids a non-admin viewing a Pablo plan (403)", async () => {
    const planId = await seedPlan();
    mocks.isOwnerEmail.mockReturnValue(false);
    authState.user = { id: "stranger", email: "stranger@example.test" };
    const res = await request(app).get(`/api/world-build/plans/${planId}/labor-summary`);
    expect(res.status).toBe(403);
  });
});
