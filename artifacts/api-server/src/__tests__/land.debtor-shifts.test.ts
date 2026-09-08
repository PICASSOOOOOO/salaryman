import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  constructionProjectsTable,
  constructionLaborLogTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import landRouter from "../routes/land";

const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: { id: "", email: "" },
};
function actAs(user: { id: string; email: string }) {
  authState.authed = true;
  authState.user = user;
}

const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];
const createdProjectIds: number[] = [];
const createdLogIds: number[] = [];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", landRouter);
  return app;
}

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `debtor-shifts-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function createOrg(ownerId: string): Promise<{ id: number; name: string }> {
  const name = `DebtorShifts Org ${randomUUID().slice(0, 8)}`;
  const [org] = await db
    .insert(organizationsTable)
    .values({ name, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id, name: organizationsTable.name });
  createdOrgIds.push(org.id);
  return { id: org.id, name: org.name };
}

async function createProject(
  ownerId: string,
  owningOrgId?: number,
): Promise<number> {
  const [proj] = await db
    .insert(constructionProjectsTable)
    .values({
      plotId: 0,
      ownerId,
      buildingType: "home",
      label: `Debtor Test Project ${randomUUID().slice(0, 8)}`,
      status: "queued",
      ...(owningOrgId != null ? { owningOrgId: String(owningOrgId) } : {}),
    })
    .returning({ id: constructionProjectsTable.id });
  createdProjectIds.push(proj.id);
  return proj.id;
}

async function insertLaborLog(
  projectId: number,
  laborerId: string,
  wasDebtor: boolean,
  benefitingOrgId?: string,
): Promise<void> {
  const [row] = await db
    .insert(constructionLaborLogTable)
    .values({
      projectId,
      laborerId,
      units: 10,
      reward: 200,
      wasDebtor,
      ...(benefitingOrgId != null ? { benefitingOrgId } : {}),
    })
    .returning({ id: constructionLaborLogTable.id });
  createdLogIds.push(row.id);
}

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
  if (createdProjectIds.length) {
    await db
      .delete(constructionProjectsTable)
      .where(inArray(constructionProjectsTable.id, createdProjectIds));
  }
  if (createdOrgIds.length) {
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("GET /api/construction/my-projects — debtorShifts field", () => {
  it("returns debtorShifts=0 when no labor log rows exist for the project", async () => {
    const owner = await createUser();
    await createProject(owner.id);

    actAs(owner);
    const res = await request(app).get("/api/construction/my-projects");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.projects)).toBe(true);
    const projects = res.body.projects as Array<{ debtorShifts: number }>;
    for (const p of projects) {
      expect(p.debtorShifts).toBe(0);
    }
  });

  it("returns the correct debtorShifts count when wasDebtor=true rows are present with matching benefitingOrgId", async () => {
    const owner = await createUser();
    const laborer = await createUser();
    const org = await createOrg(owner.id);
    const projectId = await createProject(owner.id, org.id);

    await insertLaborLog(projectId, laborer.id, true, String(org.id));
    await insertLaborLog(projectId, laborer.id, true, String(org.id));

    actAs(owner);
    const res = await request(app).get("/api/construction/my-projects");

    expect(res.status).toBe(200);
    const projects = res.body.projects as Array<{ id: number; debtorShifts: number }>;
    const proj = projects.find((p) => p.id === projectId);
    expect(proj).toBeDefined();
    expect(proj!.debtorShifts).toBe(2);
  });

  it("does NOT count wasDebtor=false rows toward debtorShifts", async () => {
    const owner = await createUser();
    const laborer = await createUser();
    const org = await createOrg(owner.id);
    const projectId = await createProject(owner.id, org.id);

    await insertLaborLog(projectId, laborer.id, false, String(org.id));
    await insertLaborLog(projectId, laborer.id, false, String(org.id));
    await insertLaborLog(projectId, laborer.id, true, String(org.id));

    actAs(owner);
    const res = await request(app).get("/api/construction/my-projects");

    expect(res.status).toBe(200);
    const projects = res.body.projects as Array<{ id: number; debtorShifts: number }>;
    const proj = projects.find((p) => p.id === projectId);
    expect(proj).toBeDefined();
    expect(proj!.debtorShifts).toBe(1);
  });
});

describe("GET /api/construction/:id/labor-summary", () => {
  it("returns totalShifts, debtorShifts, and totalUnits correctly for a project with mixed shifts", async () => {
    const owner = await createUser();
    const laborer = await createUser();
    const projectId = await createProject(owner.id);

    await insertLaborLog(projectId, laborer.id, true);
    await insertLaborLog(projectId, laborer.id, true);
    await insertLaborLog(projectId, laborer.id, false);

    actAs(owner);
    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.totalShifts).toBe(3);
    expect(res.body.debtorShifts).toBe(2);
    expect(res.body.totalUnits).toBe(30);
  });

  it("returns zeros for a project with no labor log rows", async () => {
    const owner = await createUser();
    const projectId = await createProject(owner.id);

    actAs(owner);
    const res = await request(app).get(`/api/construction/${projectId}/labor-summary`);

    expect(res.status).toBe(200);
    expect(res.body.totalShifts).toBe(0);
    expect(res.body.debtorShifts).toBe(0);
    expect(res.body.totalUnits).toBe(0);
  });

  it("returns 404 for a project that does not exist", async () => {
    const owner = await createUser();

    actAs(owner);
    const res = await request(app).get("/api/construction/999999999/labor-summary");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
