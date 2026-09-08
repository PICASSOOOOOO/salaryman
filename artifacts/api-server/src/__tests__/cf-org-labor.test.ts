// ORG LABOR HISTORY ACCESS CONTROL — GET /api/cf/org-labor-history
//
// The endpoint is manager-gated. A future query refactor that drops or weakens
// the membership/role check would silently expose every debtor record to any
// org member (or any authenticated caller). These tests lock down:
//
//   1. Auth guard    — unauthenticated requests are rejected with 401.
//   2. Role gate     — specialist (active member, but below manager rank) gets 403.
//   3. Non-member    — authenticated user who is NOT a member of the org gets 403.
//   4. Manager 200   — a manager gets 200 with summary + debtors array.
//   5. Aggregation   — cf_submissions and construction_labor_log rows are both
//                      included and totals are summed correctly per debtor.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  cfSubmissionsTable,
  constructionLaborLogTable,
  type OrgRole,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import cfRouter from "../routes/cf";

// ── Auth harness ─────────────────────────────────────────────────────────────

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};
function actAs(user: { id: string; email: string }) {
  authState.authed = true;
  authState.user = user;
}
function actAsGuest() {
  authState.authed = false;
  authState.user = { id: "", email: "" };
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated =
      () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user =
      authState.user;
    next();
  });
  app.use("/api", cfRouter);
  return app;
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `cf-org-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function createOrg(ownerId: string): Promise<number> {
  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: `CF Org Labor Test ${randomUUID().slice(0, 8)}`,
      ownerUserId: ownerId,
    })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  return org.id;
}

async function addMember(
  orgId: number,
  userId: string,
  role: OrgRole,
): Promise<void> {
  await db
    .insert(orgMembersTable)
    .values({ orgId, userId, role, status: "active" });
}

async function seedCfSubmission(opts: {
  userId: string;
  orgId: number;
  payoff: number;
  kind?: string;
}): Promise<void> {
  await db.insert(cfSubmissionsTable).values({
    userId: opts.userId,
    kind: opts.kind ?? "bug",
    payoff: opts.payoff,
    benefitingOrgId: String(opts.orgId),
    benefitingOrgName: "Test Org",
  });
}

async function seedConstructionLabor(opts: {
  laborerId: string;
  orgId: number;
  reward: number;
  units?: number;
}): Promise<void> {
  await db.insert(constructionLaborLogTable).values({
    projectId: 1,
    laborerId: opts.laborerId,
    reward: opts.reward,
    units: opts.units ?? 1,
    wasDebtor: true,
    benefitingOrgId: String(opts.orgId),
    benefitingOrgName: "Test Org",
  });
}

// ── Global state ──────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  if (createdUserIds.length) {
    await Promise.allSettled([
      db
        .delete(cfSubmissionsTable)
        .where(inArray(cfSubmissionsTable.userId, createdUserIds)),
      db
        .delete(constructionLaborLogTable)
        .where(
          inArray(constructionLaborLogTable.laborerId, createdUserIds),
        ),
      db
        .delete(orgMembersTable)
        .where(inArray(orgMembersTable.userId, createdUserIds)),
    ]);
  }
  if (createdOrgIds.length) {
    await db
      .delete(organizationsTable)
      .where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, createdUserIds));
  }
});

// ── 1. Auth guard ─────────────────────────────────────────────────────────────

describe("GET /api/cf/org-labor-history — auth guard", () => {
  it("returns 401 when the request is not authenticated", async () => {
    actAsGuest();
    const res = await request(app).get("/api/cf/org-labor-history?orgId=1");
    expect(res.status).toBe(401);
  });

  it("returns 400 when orgId query param is missing", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "manager");
    actAs(owner);

    const res = await request(app).get("/api/cf/org-labor-history");
    expect(res.status).toBe(400);
  });
});

// ── 2. Role gate — specialist is below manager ────────────────────────────────

describe("GET /api/cf/org-labor-history — role gate", () => {
  it("returns 403 when the caller is an active specialist (below manager rank)", async () => {
    const owner = await createUser();
    const specialist = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, specialist.id, "specialist");

    actAs(specialist);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/manager/i);
  });

  it("returns 403 when the caller has no membership in the org at all", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const orgId = await createOrg(owner.id);

    actAs(outsider);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/manager/i);
  });

  it("returns 403 when the caller's membership is not active (invited status)", async () => {
    const owner = await createUser();
    const invited = await createUser();
    const orgId = await createOrg(owner.id);
    await db.insert(orgMembersTable).values({
      orgId,
      userId: invited.id,
      role: "manager",
      status: "invited",
    });

    actAs(invited);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(403);
  });
});

// ── 3. Manager 200 ────────────────────────────────────────────────────────────

describe("GET /api/cf/org-labor-history — manager access", () => {
  it("returns 200 with summary and debtors array for a manager caller", async () => {
    const manager = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orgId", orgId);
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("debtors");
    expect(Array.isArray(res.body.debtors)).toBe(true);
  });

  it("returns 200 for a director (director rank > manager)", async () => {
    const director = await createUser();
    const orgId = await createOrg(director.id);
    await addMember(orgId, director.id, "director");

    actAs(director);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
  });

  it("returns an empty debtors array and zero summary when there are no labor records", async () => {
    const manager = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.debtors).toHaveLength(0);
    expect(res.body.summary.debtorCount).toBe(0);
    expect(res.body.summary.totalDebtForgiven).toBe(0);
  });
});

// ── 4. Aggregation — per-debtor counts ───────────────────────────────────────

describe("GET /api/cf/org-labor-history — aggregation", () => {
  it("includes cf_submissions rows in the debtors array", async () => {
    const manager = await createUser();
    const debtor = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    await seedCfSubmission({ userId: debtor.id, orgId, payoff: 1500 });

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    const row = res.body.debtors.find(
      (d: { userId: string }) => d.userId === debtor.id,
    );
    expect(row).toBeDefined();
    expect(row.taskCount).toBe(1);
    expect(row.totalDebtForgiven).toBe(1500);
  });

  it("includes construction_labor_log rows in the debtors array", async () => {
    const manager = await createUser();
    const laborer = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    await seedConstructionLabor({ laborerId: laborer.id, orgId, reward: 200 });

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    const row = res.body.debtors.find(
      (d: { userId: string }) => d.userId === laborer.id,
    );
    expect(row).toBeDefined();
    expect(row.shiftCount).toBe(1);
    expect(row.totalDebtForgiven).toBe(200);
  });

  it("merges cf_submissions and construction_labor_log into one debtor row per user", async () => {
    const manager = await createUser();
    const debtor = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    await seedCfSubmission({ userId: debtor.id, orgId, payoff: 1000 });
    await seedConstructionLabor({ laborerId: debtor.id, orgId, reward: 300 });

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    const rows = res.body.debtors.filter(
      (d: { userId: string }) => d.userId === debtor.id,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.taskCount).toBe(1);
    expect(row.shiftCount).toBe(1);
    expect(row.totalDebtForgiven).toBe(1300);
  });

  it("sums correctly across multiple cf_submissions and construction shifts", async () => {
    const manager = await createUser();
    const debtor = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    const payoffs = [500, 1500, 250];
    const rewards = [200, 400];
    for (const payoff of payoffs) {
      await seedCfSubmission({ userId: debtor.id, orgId, payoff });
    }
    for (const reward of rewards) {
      await seedConstructionLabor({ laborerId: debtor.id, orgId, reward });
    }

    const expectedTotal =
      payoffs.reduce((a, b) => a + b, 0) + rewards.reduce((a, b) => a + b, 0);

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    const row = res.body.debtors.find(
      (d: { userId: string }) => d.userId === debtor.id,
    );
    expect(row).toBeDefined();
    expect(row.taskCount).toBe(payoffs.length);
    expect(row.shiftCount).toBe(rewards.length);
    expect(row.totalDebtForgiven).toBe(expectedTotal);
  });

  it("only shows debtors whose labor benefited the queried org, not other orgs", async () => {
    const manager = await createUser();
    const debtorMine = await createUser();
    const debtorOther = await createUser();
    const orgIdMine = await createOrg(manager.id);
    const orgIdOther = await createOrg(manager.id);
    await addMember(orgIdMine, manager.id, "manager");

    await seedCfSubmission({ userId: debtorMine.id, orgId: orgIdMine, payoff: 800 });
    await seedCfSubmission({ userId: debtorOther.id, orgId: orgIdOther, payoff: 999 });

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgIdMine}`,
    );
    expect(res.status).toBe(200);
    const ids = res.body.debtors.map((d: { userId: string }) => d.userId);
    expect(ids).toContain(debtorMine.id);
    expect(ids).not.toContain(debtorOther.id);
  });

  it("reflects the correct summary totals across all debtors", async () => {
    const manager = await createUser();
    const debtorA = await createUser();
    const debtorB = await createUser();
    const orgId = await createOrg(manager.id);
    await addMember(orgId, manager.id, "manager");

    await seedCfSubmission({ userId: debtorA.id, orgId, payoff: 1000 });
    await seedConstructionLabor({ laborerId: debtorB.id, orgId, reward: 400 });

    actAs(manager);
    const res = await request(app).get(
      `/api/cf/org-labor-history?orgId=${orgId}`,
    );
    expect(res.status).toBe(200);
    const { summary } = res.body;
    expect(summary.debtorCount).toBe(2);
    expect(summary.totalDebtForgiven).toBe(1400);
    expect(summary.totalTaskCount).toBe(1);
    expect(summary.totalShiftCount).toBe(1);
  });
});
