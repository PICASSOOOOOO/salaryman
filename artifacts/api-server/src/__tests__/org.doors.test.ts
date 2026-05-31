import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  orgDoorLocksTable,
  type OrgRole,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import organizationsRouter from "../routes/organizations";

// Mutable auth state read by the injected middleware. Tests flip `user` to act
// as different members / outsiders, and `authed` to false for the guest path.
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

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", organizationsRouter);
  return app;
}

async function createUser(): Promise<{ id: string; email: string }> {
  const email = `doors-${randomUUID().slice(0, 8)}@example.test`;
  const [row] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id, email: usersTable.email });
  createdUserIds.push(row.id);
  return { id: row.id, email: row.email ?? email };
}

async function createOrg(ownerId: string): Promise<number> {
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: `Doors Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: ownerId })
    .returning({ id: organizationsTable.id });
  createdOrgIds.push(org.id);
  return org.id;
}

async function addMember(orgId: number, userId: string, role: OrgRole) {
  await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
}

let app: Express;

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  if (createdOrgIds.length) {
    await db.delete(orgDoorLocksTable).where(inArray(orgDoorLocksTable.orgId, createdOrgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
});

describe("Org door locks — server-authoritative access control", () => {
  it("lets a manager set a door lock, then enforces role-based entry", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");
    const specialist = await createUser();
    await addMember(orgId, specialist.id, "specialist");

    const doorKey = `space-${randomUUID().slice(0, 10)}`;

    // Owner (manager+) sets a lock requiring at least 'director' to enter freely.
    actAs(owner);
    const setRes = await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey, label: "Exec Suite", spaceType: "office", passcode: "secret1!", minRole: "director" });
    expect(setRes.status).toBe(200);
    expect(setRes.body.door.doorKey).toBe(doorKey);

    // Owner outranks director → enters as member, no passcode.
    const ownerEnter = await request(app).post("/api/orgs/doors/enter").send({ doorKey });
    expect(ownerEnter.status).toBe(200);
    expect(ownerEnter.body).toMatchObject({ allowed: true, asMember: true });

    // Specialist is below director → denied without a passcode.
    actAs(specialist);
    const specEnter = await request(app).post("/api/orgs/doors/enter").send({ doorKey });
    expect(specEnter.status).toBe(200);
    expect(specEnter.body).toMatchObject({ allowed: false, requiresPasscode: true });

    // Specialist with the correct passcode gets in (as guest, not member).
    const specPass = await request(app).post("/api/orgs/doors/enter").send({ doorKey, passcode: "secret1!" });
    expect(specPass.status).toBe(200);
    expect(specPass.body).toMatchObject({ allowed: true, asMember: false });
  });

  it("blocks outsiders and guests unless they have the passcode", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");
    const outsider = await createUser();

    const doorKey = `space-${randomUUID().slice(0, 10)}`;
    actAs(owner);
    await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey, passcode: "letmein9#", minRole: "specialist" });

    // Outsider (different user, no membership) → denied.
    actAs(outsider);
    const outDenied = await request(app).post("/api/orgs/doors/enter").send({ doorKey });
    expect(outDenied.body).toMatchObject({ allowed: false, requiresPasscode: true });

    // Guest (unauthenticated) with passcode → allowed.
    actAsGuest();
    const guestPass = await request(app).post("/api/orgs/doors/enter").send({ doorKey, passcode: "letmein9#" });
    expect(guestPass.body).toMatchObject({ allowed: true, asMember: false });

    // Wrong passcode → denied.
    const guestWrong = await request(app).post("/api/orgs/doors/enter").send({ doorKey, passcode: "nope" });
    expect(guestWrong.body.allowed).toBe(false);
  });

  it("allows entry to unlocked doors and rejects non-managers managing locks", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");
    const specialist = await createUser();
    await addMember(orgId, specialist.id, "specialist");

    // Unknown door key → not locked, entry allowed.
    actAs(specialist);
    const open = await request(app).post("/api/orgs/doors/enter").send({ doorKey: `unlocked-${randomUUID()}` });
    expect(open.body).toMatchObject({ allowed: true, locked: false });

    // Specialist cannot create a lock.
    const denied = await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey: `x-${randomUUID().slice(0, 8)}`, passcode: "abc123!" });
    expect(denied.status).toBe(403);

    // Short passcode rejected for managers.
    actAs(owner);
    const shortPw = await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey: `x-${randomUUID().slice(0, 8)}`, passcode: "a1!" });
    expect(shortPw.status).toBe(400);
  });

  it("exposes locked doors under `doors` and lets managers update metadata without re-entering the passcode", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");
    const outsider = await createUser();

    const doorKey = `space-${randomUUID().slice(0, 10)}`;
    actAs(owner);
    await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey, label: "Lab", spaceType: "office", passcode: "secret1!", minRole: "specialist" });

    // The public hint exposes the door under the canonical `doors` key (this is
    // exactly what the client reads to know which doors to gate).
    const hint = await request(app).get("/api/orgs/doors/locked");
    expect(hint.status).toBe(200);
    expect(Array.isArray(hint.body.doors)).toBe(true);
    const hinted = (hint.body.doors as Array<{ doorKey: string; minRole: string }>).find((d) => d.doorKey === doorKey);
    expect(hinted).toBeTruthy();
    expect(hinted?.minRole).toBe("specialist");
    // Passcodes must never leak through the public hint.
    expect(JSON.stringify(hint.body)).not.toContain("secret1!");

    // Metadata-only update (no passcode) → keeps the existing passcode working.
    const metaUpdate = await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey, label: "Renamed Lab", spaceType: "office", minRole: "director" });
    expect(metaUpdate.status).toBe(200);
    expect(metaUpdate.body.door.minRole).toBe("director");

    // The original passcode still unlocks for an outsider after the metadata edit.
    actAs(outsider);
    const stillWorks = await request(app).post("/api/orgs/doors/enter").send({ doorKey, passcode: "secret1!" });
    expect(stillWorks.body).toMatchObject({ allowed: true, asMember: false });

    // Creating a brand-new lock without any passcode is still rejected.
    actAs(owner);
    const noPass = await request(app)
      .post(`/api/orgs/${orgId}/doors`)
      .send({ doorKey: `new-${randomUUID().slice(0, 8)}`, spaceType: "office" });
    expect(noPass.status).toBe(400);
  });

  it("prevents one org from hijacking another org's door, and supports delete", async () => {
    const ownerA = await createUser();
    const orgA = await createOrg(ownerA.id);
    await addMember(orgA, ownerA.id, "owner");
    const ownerB = await createUser();
    const orgB = await createOrg(ownerB.id);
    await addMember(orgB, ownerB.id, "owner");

    const doorKey = `shared-${randomUUID().slice(0, 10)}`;
    actAs(ownerA);
    const aSet = await request(app).post(`/api/orgs/${orgA}/doors`).send({ doorKey, passcode: "alpha12!" });
    expect(aSet.status).toBe(200);

    // Org B tries to lock the same key → conflict.
    actAs(ownerB);
    const bSet = await request(app).post(`/api/orgs/${orgB}/doors`).send({ doorKey, passcode: "beta123!" });
    expect(bSet.status).toBe(409);

    // Org A deletes its lock → key is free again.
    actAs(ownerA);
    const del = await request(app).delete(`/api/orgs/${orgA}/doors/${doorKey}`);
    expect(del.status).toBe(200);
    const afterDel = await request(app).post("/api/orgs/doors/enter").send({ doorKey });
    expect(afterDel.body).toMatchObject({ allowed: true, locked: false });
  });
});
