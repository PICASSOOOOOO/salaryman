import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import {
  buildApp,
  seedProject,
  seedShift,
  resetAuthState,
  cleanupTestData,
  authState,
  LAND_USER,
} from "./helpers/landTestApp";

// This suite guards the GET /api/construction/:id/labor-summary endpoint that
// the expanded project panel fetches on expand. The headline field is
// totalDebtForgiven — the sum of `reward` across DEBTOR shifts only — which
// feeds the "FORGIVEN" stat tile. A regression here would silently break the
// expanded breakdown, so we assert the aggregation directly.

const app = buildApp();

beforeEach(async () => {
  resetAuthState();
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/construction/:id/labor-summary", () => {
  it("sums totalDebtForgiven from debtor-shift reward values only", async () => {
    const projectId = await seedProject();

    // Two debtor shifts (forgiven) + one non-debtor wage shift (NOT forgiven).
    await seedShift({ projectId, laborerId: "debtor-a", units: 5, reward: 200, wasDebtor: true });
    await seedShift({ projectId, laborerId: "debtor-b", units: 3, reward: 150, wasDebtor: true });
    await seedShift({ projectId, laborerId: "wage-c", units: 4, reward: 999, wasDebtor: false });

    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
    // Forgiven = 200 + 150 = 350; the ƒ999 wage shift is excluded.
    expect(res.body.totalDebtForgiven).toBe(350);
    expect(res.body.totalShifts).toBe(3);
    expect(res.body.debtorShifts).toBe(2);
    expect(res.body.totalUnits).toBe(12);
    expect(res.body.totalDebtorLaborers).toBe(2);
    expect(Array.isArray(res.body.laborers)).toBe(true);
    expect(res.body.laborers).toHaveLength(2);
  });

  it("returns zeroed totals for a project with no shifts", async () => {
    const projectId = await seedProject();

    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.totalDebtForgiven).toBe(0);
    expect(res.body.totalShifts).toBe(0);
    expect(res.body.debtorShifts).toBe(0);
    expect(res.body.totalDebtorLaborers).toBe(0);
    expect(res.body.laborers).toEqual([]);
  });

  it("aggregates multiple debtor shifts per laborer into one breakdown row", async () => {
    const projectId = await seedProject();
    // Same laborer works three debtor shifts; should collapse to one row.
    await seedShift({ projectId, laborerId: "debtor-a", units: 2, reward: 100, wasDebtor: true });
    await seedShift({ projectId, laborerId: "debtor-a", units: 3, reward: 100, wasDebtor: true });
    await seedShift({ projectId, laborerId: "debtor-a", units: 1, reward: 100, wasDebtor: true });

    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.totalDebtForgiven).toBe(300);
    expect(res.body.totalDebtorLaborers).toBe(1);
    expect(res.body.laborers).toHaveLength(1);
    const row = res.body.laborers[0];
    expect(row.laborerId).toBe("debtor-a");
    expect(row.shifts).toBe(3);
    expect(row.totalUnits).toBe(6);
    expect(row.totalReward).toBe(300);
  });

  it("requires authentication (401)", async () => {
    const projectId = await seedProject();
    authState.authed = false;
    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a non-existent project", async () => {
    const res = await request(app).get(`/api/construction/999999999/labor-summary`);
    expect(res.status).toBe(404);
  });

  it("rejects an invalid project id (400)", async () => {
    const res = await request(app).get(`/api/construction/not-a-number/labor-summary`);
    expect(res.status).toBe(400);
  });

  it("forbids a non-owner with no org role (403)", async () => {
    const projectId = await seedProject();
    // Act as a different, unprivileged user.
    authState.user = { id: `stranger-${LAND_USER.id}`, email: "stranger@example.test" };
    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);
    expect(res.status).toBe(403);
  });
});
