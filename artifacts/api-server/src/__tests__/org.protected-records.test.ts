import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  orgMembersTable,
  orgProtectedRecordsTable,
  organizationsTable,
  usersTable,
  type OrgRole,
} from "@workspace/db";
import organizationsRouter from "../routes/organizations";

process.env.SESSION_SECRET ||= "org-protected-record-route-tests";

const authState = { user: { id: "", email: "" } };
const createdUserIds: string[] = [];
const createdOrgIds: number[] = [];

function actAs(user: { id: string; email: string }) {
  authState.user = user;
}

async function createUser() {
  const email = `org-records-${randomUUID()}@example.test`;
  const [user] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id, email: usersTable.email });
  const result = { id: user.id, email: user.email ?? email };
  createdUserIds.push(result.id);
  return result;
}

async function createOrg(ownerId: string, options?: { isDeveloper?: boolean }) {
  const [org] = await db.insert(organizationsTable).values({
    name: `RECORDS TEST ${randomUUID()}`,
    ownerUserId: ownerId,
    isDeveloper: options?.isDeveloper ?? false,
  }).returning({ id: organizationsTable.id, name: organizationsTable.name });
  createdOrgIds.push(org.id);
  await db.insert(orgMembersTable).values({ orgId: org.id, userId: ownerId, role: "owner", status: "active" });
  return org;
}

async function addMember(orgId: number, userId: string, role: OrgRole) {
  await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
}

let app: Express;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
    (req as unknown as { user: typeof authState.user }).user = authState.user;
    next();
  });
  app.use("/api", organizationsRouter);
});

afterAll(async () => {
  if (createdOrgIds.length) {
    await db.delete(orgProtectedRecordsTable).where(inArray(orgProtectedRecordsTable.orgId, createdOrgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
  }
  if (createdUserIds.length) await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
});

describe("organization settings and protected records", () => {
  it("persists expanded organization settings for managers", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, manager.id, "manager");
    actAs(manager);

    const update = await request(app).put(`/api/orgs/${org.id}`).send({
      name: org.name,
      industry: "Technology",
      size: "11-50",
      description: "Secure research and operations.",
      website: "https://example.test",
      businessAddress: "1 Test Way",
      contactEmail: "OPS@EXAMPLE.TEST",
      contactPhone: "+1 555 0100",
      legalEntityName: "Records Test LLC",
      entityType: "LLC",
    });
    expect(update.status).toBe(200);
    expect(update.body.org).toMatchObject({
      description: "Secure research and operations.",
      website: "https://example.test",
      businessAddress: "1 Test Way",
      contactEmail: "ops@example.test",
      legalEntityName: "Records Test LLC",
      entityType: "LLC",
    });

    const detail = await request(app).get(`/api/orgs/${org.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.org.contactPhone).toBe("+1 555 0100");
  });

  it("encrypts values, masks lists, gates every action, and isolates organizations", async () => {
    const ownerA = await createUser();
    const managerA = await createUser();
    const specialistA = await createUser();
    const ownerB = await createUser();
    const orgA = await createOrg(ownerA.id);
    const orgB = await createOrg(ownerB.id);
    await addMember(orgA.id, managerA.id, "manager");
    await addMember(orgA.id, specialistA.id, "specialist");

    actAs(managerA);
    const create = await request(app).post(`/api/orgs/${orgA.id}/protected-records`).send({
      label: "Federal tax ID",
      value: "98-7654321",
    });
    expect(create.status).toBe(201);
    expect(create.body.record).toMatchObject({ label: "Federal tax ID", maskedValue: "••••••4321" });
    expect(create.body.record).not.toHaveProperty("value");
    expect(create.body.record).not.toHaveProperty("encryptedValue");
    const recordId = create.body.record.id as number;

    const [stored] = await db.select().from(orgProtectedRecordsTable).where(and(
      eq(orgProtectedRecordsTable.id, recordId),
      eq(orgProtectedRecordsTable.orgId, orgA.id),
    ));
    expect(stored.encryptedValue).not.toContain("98-7654321");
    expect(stored.encryptedValue.startsWith("v1:")).toBe(true);

    const list = await request(app).get(`/api/orgs/${orgA.id}/protected-records`);
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("no-store");
    expect(list.body.records[0]).not.toHaveProperty("encryptedValue");
    expect(JSON.stringify(list.body)).not.toContain("98-7654321");

    actAs(specialistA);
    expect((await request(app).get(`/api/orgs/${orgA.id}/protected-records`)).status).toBe(403);
    expect((await request(app).post(`/api/orgs/${orgA.id}/protected-records/${recordId}/reveal`)).status).toBe(403);
    expect((await request(app).put(`/api/orgs/${orgA.id}/protected-records/${recordId}`).send({ label: "Nope" })).status).toBe(403);
    expect((await request(app).delete(`/api/orgs/${orgA.id}/protected-records/${recordId}`)).status).toBe(403);

    actAs(ownerB);
    expect((await request(app).post(`/api/orgs/${orgA.id}/protected-records/${recordId}/reveal`)).status).toBe(403);
    expect((await request(app).post(`/api/orgs/${orgB.id}/protected-records/${recordId}/reveal`)).status).toBe(404);

    actAs(managerA);
    const update = await request(app).put(`/api/orgs/${orgA.id}/protected-records/${recordId}`).send({
      label: "Updated tax ID",
      value: "11-2222333",
    });
    expect(update.status).toBe(200);
    expect(update.body.record.maskedValue).toBe("••••••2333");
    const reveal = await request(app).post(`/api/orgs/${orgA.id}/protected-records/${recordId}/reveal`);
    expect(reveal.status).toBe(200);
    expect(reveal.headers["cache-control"]).toBe("no-store");
    expect(reveal.body.value).toBe("11-2222333");

    const deleted = await request(app).delete(`/api/orgs/${orgA.id}/protected-records/${recordId}`);
    expect(deleted.status).toBe(200);
    expect((await request(app).post(`/api/orgs/${orgA.id}/protected-records/${recordId}/reveal`)).status).toBe(404);
  });

  it("keeps developer organizations protected from deletion", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id, { isDeveloper: true });
    actAs(owner);
    const response = await request(app).delete(`/api/orgs/${org.id}`).send({ confirmName: org.name });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/reserved organizations/i);
  });
});