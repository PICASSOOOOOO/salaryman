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
  type OrgRole,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import landRouter from "../routes/land";

// Mutable auth state — tests flip `user` to act as different callers.
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

const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];
const createdProjectIds: number[] = [];

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
  const email = `set-org-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db
    .insert(usersTable)
    .values({ email })
    .returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function createOrg(ownerId: string): Promise<{ id: number; name: string }> {
  const name = `SetOrg Test Org ${randomUUID().slice(0, 8)}`;
  const [org] = await db
    .insert(organizationsTable)
    .values({ name, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id, name: organizationsTable.name });
  createdOrgIds.push(org.id);
  return { id: org.id, name: org.name };
}

async function addMember(orgId: number, userId: string, role: OrgRole) {
  await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
}

async function createProject(ownerId: string): Promise<number> {
  const [proj] = await db
    .insert(constructionProjectsTable)
    .values({
      plotId: 0,
      ownerId,
      buildingType: "home",
      label: `Test Project ${randomUUID().slice(0, 8)}`,
      status: "queued",
    })
    .returning({ id: constructionProjectsTable.id });
  createdProjectIds.push(proj.id);
  return proj.id;
}

let app: Express;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
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

describe("PATCH /api/construction/:id/set-org — CF labor org association", () => {
  it("allows project owner who is an org admin to associate org and enable debtor labor", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "owner");
    const projectId = await createProject(owner.id);

    actAs(owner);
    const res = await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: org.id, openToDebtorLabor: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.owningOrgId).toBe(String(org.id));
    expect(res.body.owningOrgName).toBe(org.name);
    expect(res.body.openToDebtorLabor).toBe(true);
  });

  it("rejects a non-owner with 403 even if they are an org admin", async () => {
    const owner = await createUser();
    const interloper = await createUser();
    const org = await createOrg(interloper.id);
    await addMember(org.id, interloper.id, "owner");
    const projectId = await createProject(owner.id);

    actAs(interloper);
    const res = await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: org.id, openToDebtorLabor: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/project owner/i);
  });

  it("rejects project owner who has no org admin role with 403", async () => {
    const owner = await createUser();
    const orgOwner = await createUser();
    const org = await createOrg(orgOwner.id);
    // owner is only a specialist — below the manager threshold
    await addMember(org.id, owner.id, "specialist");
    const projectId = await createProject(owner.id);

    actAs(owner);
    const res = await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: org.id, openToDebtorLabor: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/org admin/i);
  });

  it("clearing (owningOrgId: null) resets openToDebtorLabor to false", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "owner");
    const projectId = await createProject(owner.id);

    actAs(owner);
    // First associate the project with the org.
    await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: org.id, openToDebtorLabor: true });

    // Now clear it.
    const clearRes = await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: null });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.ok).toBe(true);
    expect(clearRes.body.owningOrgId).toBeNull();
    expect(clearRes.body.owningOrgName).toBeNull();
    expect(clearRes.body.openToDebtorLabor).toBe(false);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const owner = await createUser();
    const projectId = await createProject(owner.id);

    actAsGuest();
    const res = await request(app)
      .patch(`/api/construction/${projectId}/set-org`)
      .send({ owningOrgId: 1, openToDebtorLabor: true });

    expect(res.status).toBe(401);
  });

  it("returns 404 for a project that does not exist", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, owner.id, "owner");

    actAs(owner);
    const res = await request(app)
      .patch("/api/construction/999999999/set-org")
      .send({ owningOrgId: org.id, openToDebtorLabor: true });

    expect(res.status).toBe(404);
  });
});
