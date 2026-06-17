import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import {
  buildApp,
  seedProject,
  seedShift,
  seedUser,
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

  it("filters the breakdown by laborer name via the q param", async () => {
    const projectId = await seedProject();
    await seedUser({ id: "ls-alpha", username: "Alpha" });
    await seedUser({ id: "ls-bravo", firstName: "Bravo" });
    await seedShift({ projectId, laborerId: "ls-alpha", units: 1, reward: 100, wasDebtor: true });
    await seedShift({ projectId, laborerId: "ls-bravo", units: 1, reward: 200, wasDebtor: true });

    // Match on username (case-insensitive substring).
    const byUser = await request(app).get(`/api/construction/${projectId}/labor-summary?q=alp`);
    expect(byUser.status).toBe(200);
    expect(byUser.body.laborers).toHaveLength(1);
    expect(byUser.body.laborers[0].laborerId).toBe("ls-alpha");
    // matchedLaborers drives pagination; totalDebtorLaborers stays unfiltered.
    expect(byUser.body.matchedLaborers).toBe(1);
    expect(byUser.body.totalDebtorLaborers).toBe(2);
    expect(byUser.body.q).toBe("alp");

    // Match on firstName.
    const byFirst = await request(app).get(`/api/construction/${projectId}/labor-summary?q=brav`);
    expect(byFirst.status).toBe(200);
    expect(byFirst.body.laborers).toHaveLength(1);
    expect(byFirst.body.laborers[0].laborerId).toBe("ls-bravo");

    // No match yields an empty breakdown but still 200.
    const none = await request(app).get(`/api/construction/${projectId}/labor-summary?q=zzz`);
    expect(none.status).toBe(200);
    expect(none.body.laborers).toEqual([]);
    expect(none.body.matchedLaborers).toBe(0);
    expect(none.body.totalPages).toBe(1);
  });

  it("sorts the breakdown by shifts and by debt forgiven in both directions", async () => {
    const projectId = await seedProject();
    // low: 1 shift / ƒ500 forgiven ; high: 3 shifts / ƒ300 forgiven.
    await seedShift({ projectId, laborerId: "ls-low", units: 1, reward: 500, wasDebtor: true });
    await seedShift({ projectId, laborerId: "ls-high", units: 1, reward: 100, wasDebtor: true });
    await seedShift({ projectId, laborerId: "ls-high", units: 1, reward: 100, wasDebtor: true });
    await seedShift({ projectId, laborerId: "ls-high", units: 1, reward: 100, wasDebtor: true });

    const shiftsDesc = await request(app).get(`/api/construction/${projectId}/labor-summary?sort=shifts&dir=desc`);
    expect(shiftsDesc.status).toBe(200);
    expect(shiftsDesc.body.sort).toBe("shifts");
    expect(shiftsDesc.body.dir).toBe("desc");
    expect(shiftsDesc.body.laborers.map((r: { laborerId: string }) => r.laborerId)).toEqual(["ls-high", "ls-low"]);

    const shiftsAsc = await request(app).get(`/api/construction/${projectId}/labor-summary?sort=shifts&dir=asc`);
    expect(shiftsAsc.body.laborers.map((r: { laborerId: string }) => r.laborerId)).toEqual(["ls-low", "ls-high"]);

    const debtDesc = await request(app).get(`/api/construction/${projectId}/labor-summary?sort=debt&dir=desc`);
    expect(debtDesc.body.laborers.map((r: { laborerId: string }) => r.laborerId)).toEqual(["ls-low", "ls-high"]);

    const debtAsc = await request(app).get(`/api/construction/${projectId}/labor-summary?sort=debt&dir=asc`);
    expect(debtAsc.body.laborers.map((r: { laborerId: string }) => r.laborerId)).toEqual(["ls-high", "ls-low"]);
  });
});
