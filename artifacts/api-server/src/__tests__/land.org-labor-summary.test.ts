// ORG LABOR SUMMARY — GET /api/construction/org-labor-summary
//
// Locks down:
//   1. 403 for unauthenticated requests
//   2. 403 for authenticated callers with no manager+ role
//   3. All-time totals — shifts, debtForgiven, uniqueLaborers
//   4. 7-day window — excludes rows older than 7 days
//   5. Org scoping — another org's labor is not included
//   6. wasDebtor=false rows are excluded from all aggregations

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  constructionLaborLogTable,
  type OrgRole,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import landRouter from "../routes/land";

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
  app.use("/api", landRouter);
  return app;
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];
const createdLogIds: number[] = [];

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `org-labor-summary-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function createOrg(ownerId: string): Promise<{ id: number; name: string }> {
  const name = `OrgLaborSummary Org ${randomUUID().slice(0, 8)}`;
  const [org] = await db
    .insert(organizationsTable)
    .values({ name, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id, name: organizationsTable.name });
  createdOrgIds.push(org.id);
  return { id: org.id, name: org.name };
}

async function addMember(
  orgId: number,
  userId: string,
  role: OrgRole,
  status = "active",
): Promise<void> {
  await db.insert(orgMembersTable).values({ orgId, userId, role, status });
}

async function seedLaborLog(opts: {
  laborerId: string;
  orgId: number;
  reward?: number;
  wasDebtor?: boolean;
  createdAt?: Date;
}): Promise<void> {
  const [row] = await db
    .insert(constructionLaborLogTable)
    .values({
      projectId: 1,
      laborerId: opts.laborerId,
      units: 10,
      reward: opts.reward ?? 200,
      wasDebtor: opts.wasDebtor ?? true,
      benefitingOrgId: String(opts.orgId),
      benefitingOrgName: "Test Org",
      ...(opts.createdAt != null ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: constructionLaborLogTable.id });
  createdLogIds.push(row.id);
}

// A timestamp safely outside the 7-day window
function oldDate(): Date {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

// ── Global state ──────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  if (createdLogIds.length) {
    await db
      .delete(constructionLaborLogTable)
      .where(inArray(constructionLaborLogTable.id, createdLogIds));
  }
  if (createdOrgIds.length) {
    await db
      .delete(orgMembersTable)
      .where(inArray(orgMembersTable.orgId, createdOrgIds));
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

// ── 1. Auth / role guards ─────────────────────────────────────────────────────

describe("GET /api/construction/org-labor-summary — guards", () => {
  it("returns 401 when the request is not authenticated", async () => {
    actAsGuest();
    const res = await request(app).get("/api/construction/org-labor-summary");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller has no org membership at all", async () => {
    const outsider = await createUser();
    actAs(outsider);
    const res = await request(app).get("/api/construction/org-labor-summary");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it("returns 403 when the caller's role is below manager (specialist)", async () => {
    const owner = await createUser();
    const specialist = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, specialist.id, "specialist");

    actAs(specialist);
    const res = await request(app).get("/api/construction/org-labor-summary");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  it("returns 403 when the caller's membership is not active (invited)", async () => {
    const owner = await createUser();
    const invited = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, invited.id, "manager", "invited");

    actAs(invited);
    const res = await request(app).get("/api/construction/org-labor-summary");
    expect(res.status).toBe(403);
  });
});

// ── 2. All-time totals ────────────────────────────────────────────────────────

describe("GET /api/construction/org-labor-summary — all-time totals", () => {
  it("returns 200 with zero totals when no labor log rows exist for the org", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "manager");

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(org.id);
    expect(res.body.orgName).toBe(org.name);
    expect(res.body.allTime.shifts).toBe(0);
    expect(res.body.allTime.debtForgiven).toBe(0);
    expect(res.body.allTime.uniqueLaborers).toBe(0);
    expect(res.body.week.shifts).toBe(0);
    expect(res.body.week.debtForgiven).toBe(0);
    expect(res.body.week.uniqueLaborers).toBe(0);
  });

  it("counts all debtor shifts and sums debtForgiven correctly all-time", async () => {
    const owner = await createUser();
    const laborerA = await createUser();
    const laborerB = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "manager");

    // 3 shifts: two laborers, rewards 200 + 300 + 500
    await seedLaborLog({ laborerId: laborerA.id, orgId: org.id, reward: 200 });
    await seedLaborLog({ laborerId: laborerA.id, orgId: org.id, reward: 300 });
    await seedLaborLog({ laborerId: laborerB.id, orgId: org.id, reward: 500 });

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    expect(res.body.allTime.shifts).toBe(3);
    expect(res.body.allTime.debtForgiven).toBe(1000);
    expect(res.body.allTime.uniqueLaborers).toBe(2);
  });

  it("does NOT count wasDebtor=false rows in any aggregation", async () => {
    const owner = await createUser();
    const worker = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "manager");

    // One debtor shift + two non-debtor shifts
    await seedLaborLog({ laborerId: worker.id, orgId: org.id, reward: 200, wasDebtor: true });
    await seedLaborLog({ laborerId: worker.id, orgId: org.id, reward: 999, wasDebtor: false });
    await seedLaborLog({ laborerId: worker.id, orgId: org.id, reward: 999, wasDebtor: false });

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    // Only the single wasDebtor=true row should be counted
    expect(res.body.allTime.shifts).toBe(1);
    expect(res.body.allTime.debtForgiven).toBe(200);
    expect(res.body.allTime.uniqueLaborers).toBe(1);
  });
});

// ── 3. 7-day window ──────────────────────────────────────────────────────────

describe("GET /api/construction/org-labor-summary — 7-day window", () => {
  it("week window excludes rows older than 7 days while all-time includes them", async () => {
    const owner = await createUser();
    const laborer = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "manager");

    // 1 old shift (>7 days ago) + 2 recent shifts
    await seedLaborLog({ laborerId: laborer.id, orgId: org.id, reward: 400, createdAt: oldDate() });
    await seedLaborLog({ laborerId: laborer.id, orgId: org.id, reward: 200 });
    await seedLaborLog({ laborerId: laborer.id, orgId: org.id, reward: 200 });

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    // All-time sees all 3
    expect(res.body.allTime.shifts).toBe(3);
    expect(res.body.allTime.debtForgiven).toBe(800);
    // Week window sees only the 2 recent ones
    expect(res.body.week.shifts).toBe(2);
    expect(res.body.week.debtForgiven).toBe(400);
    expect(res.body.week.uniqueLaborers).toBe(1);
  });

  it("week uniqueLaborers counts only laborers who have a recent shift", async () => {
    const owner = await createUser();
    const recentLaborer = await createUser();
    const oldLaborer = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "manager");

    await seedLaborLog({ laborerId: recentLaborer.id, orgId: org.id, reward: 200 });
    await seedLaborLog({ laborerId: oldLaborer.id, orgId: org.id, reward: 200, createdAt: oldDate() });

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    expect(res.body.allTime.uniqueLaborers).toBe(2);
    expect(res.body.week.uniqueLaborers).toBe(1);
  });
});

// ── 4. Org scoping ────────────────────────────────────────────────────────────

describe("GET /api/construction/org-labor-summary — org scoping", () => {
  it("only aggregates labor rows that benefited the caller's org, not other orgs", async () => {
    const ownerMine = await createUser();
    const ownerOther = await createUser();
    const laborerMine = await createUser();
    const laborerOther = await createUser();

    const orgMine = await createOrg(ownerMine.id);
    const orgOther = await createOrg(ownerOther.id);
    await addMember(orgMine.id, ownerMine.id, "manager");

    // 2 shifts for my org, 3 for the other org
    await seedLaborLog({ laborerId: laborerMine.id, orgId: orgMine.id, reward: 200 });
    await seedLaborLog({ laborerId: laborerMine.id, orgId: orgMine.id, reward: 200 });
    await seedLaborLog({ laborerId: laborerOther.id, orgId: orgOther.id, reward: 500 });
    await seedLaborLog({ laborerId: laborerOther.id, orgId: orgOther.id, reward: 500 });
    await seedLaborLog({ laborerId: laborerOther.id, orgId: orgOther.id, reward: 500 });

    actAs(ownerMine);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(orgMine.id);
    // Only my org's 2 shifts
    expect(res.body.allTime.shifts).toBe(2);
    expect(res.body.allTime.debtForgiven).toBe(400);
    expect(res.body.allTime.uniqueLaborers).toBe(1);
  });

  it("returns the correct orgId and orgName in the response", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "director");

    actAs(owner);
    const res = await request(app).get("/api/construction/org-labor-summary");

    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(org.id);
    expect(res.body.orgName).toBe(org.name);
  });
});
