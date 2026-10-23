import express from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  leadRecordsTable,
  orgConnectorActivityTable,
  orgConnectorAppsTable,
  orgConnectorConnectionsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { createOrgConnectorToken, hashOrgConnectorToken } from "../lib/org-connectors";
import orgConnectorCrmRouter from "../routes/org-connector-crm";
import orgConnectorsRouter from "../routes/org-connectors";

const app = express();
app.use(express.json());
app.use("/api", orgConnectorsRouter, orgConnectorCrmRouter);

const userIds: string[] = [];
const orgIds: number[] = [];
const appIds: number[] = [];

let primaryOrgId = 0;
let secondaryOrgId = 0;
let readToken = "";
let writeToken = "";
let revokeToken = "";
let writeConnectionId = 0;
let revokeConnectionId = 0;
let primaryLeadId = 0;
let secondaryLeadId = 0;

async function createUser(): Promise<string> {
  const [user] = await db.insert(usersTable)
    .values({ email: `org-connector-${randomUUID()}@example.test` })
    .returning({ id: usersTable.id });
  userIds.push(user.id);
  return user.id;
}

async function createOrg(ownerUserId: string): Promise<number> {
  const [org] = await db.insert(organizationsTable)
    .values({ name: `Connector test ${randomUUID()}`, ownerUserId })
    .returning({ id: organizationsTable.id });
  orgIds.push(org.id);
  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId: ownerUserId,
    role: "owner",
    status: "active",
  });
  return org.id;
}

async function createConnection(orgId: number, scopes: string[]) {
  const ownerUserId = orgId === primaryOrgId ? userIds[0] : userIds[1];
  const [registeredApp] = await db.insert(orgConnectorAppsTable).values({
    ownerUserId,
    clientId: `sma_test_${randomUUID().replace(/-/g, "")}`,
    name: "CRM Connector Test",
    description: "Integration test app",
    requestedScopes: scopes as any,
  }).returning({ id: orgConnectorAppsTable.id });
  appIds.push(registeredApp.id);

  const token = createOrgConnectorToken();
  const [connection] = await db.insert(orgConnectorConnectionsTable).values({
    orgId,
    appId: registeredApp.id,
    grantedScopes: scopes as any,
    status: "connected",
    tokenHash: hashOrgConnectorToken(token),
    tokenPrefix: token.slice(0, 16),
    connectedByUserId: ownerUserId,
  }).returning({ id: orgConnectorConnectionsTable.id });
  return { token, connectionId: connection.id };
}

async function createLead(orgId: number, ownerUserId: string, name: string): Promise<number> {
  const [lead] = await db.insert(leadRecordsTable).values({
    orgId,
    name,
    phone: "555-0100",
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
    company: "Test Company",
    jobTitle: "Buyer",
    source: "integration-test",
    status: "new",
    assignedUserId: null,
    pabloNotesJson: JSON.stringify(["private call summary"]),
    callCount: 4,
    createdByUserId: ownerUserId,
    customFieldsJson: {},
  }).returning({ id: leadRecordsTable.id });
  return lead.id;
}

beforeAll(async () => {
  const ownerA = await createUser();
  const ownerB = await createUser();
  primaryOrgId = await createOrg(ownerA);
  secondaryOrgId = await createOrg(ownerB);

  const readConnection = await createConnection(primaryOrgId, ["crm:read"]);
  readToken = readConnection.token;
  const writeConnection = await createConnection(primaryOrgId, ["crm:write"]);
  writeToken = writeConnection.token;
  writeConnectionId = writeConnection.connectionId;
  const revokedConnection = await createConnection(primaryOrgId, ["crm:read"]);
  revokeToken = revokedConnection.token;
  revokeConnectionId = revokedConnection.connectionId;

  primaryLeadId = await createLead(primaryOrgId, ownerA, "Primary Org Lead");
  secondaryLeadId = await createLead(secondaryOrgId, ownerB, "Secondary Org Lead");
});

afterAll(async () => {
  if (orgIds.length) {
    await db.delete(orgConnectorActivityTable).where(inArray(orgConnectorActivityTable.orgId, orgIds));
    await db.delete(orgConnectorConnectionsTable).where(inArray(orgConnectorConnectionsTable.orgId, orgIds));
    await db.delete(leadRecordsTable).where(inArray(leadRecordsTable.orgId, orgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, orgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds));
  }
  if (appIds.length) await db.delete(orgConnectorAppsTable).where(inArray(orgConnectorAppsTable.id, appIds));
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

describe("organization connector CRM API", () => {
  it("limits CRM reads to the token organization and omits private call notes", async () => {
    const response = await request(app)
      .get("/api/connectors/v1/crm/leads?limit=20")
      .set("Authorization", `Bearer ${readToken}`);

    expect(response.status).toBe(200);
    expect(response.body.leads.map((lead: { name: string }) => lead.name)).toContain("Primary Org Lead");
    expect(response.body.leads.map((lead: { name: string }) => lead.name)).not.toContain("Secondary Org Lead");
    expect(response.body.leads[0]).not.toHaveProperty("pabloNotesJson");
    expect(response.body.leads[0]).not.toHaveProperty("callCount");

    const foreignLead = await request(app)
      .get(`/api/connectors/v1/crm/leads/${secondaryLeadId}`)
      .set("Authorization", `Bearer ${readToken}`);
    expect(foreignLead.status).toBe(404);

    const detail = await request(app)
      .get(`/api/connectors/v1/crm/leads/${primaryLeadId}`)
      .set("Authorization", `Bearer ${readToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lead).not.toHaveProperty("pabloNotesJson");
    expect(detail.body.lead).not.toHaveProperty("callCount");
  });

  it("enforces read and write scopes on their corresponding CRM endpoints", async () => {
    const deniedWrite = await request(app)
      .post("/api/connectors/v1/crm/leads")
      .set("Authorization", `Bearer ${readToken}`)
      .send({ name: "Must not be created" });
    expect(deniedWrite.status).toBe(403);

    const deniedDetail = await request(app)
      .get(`/api/connectors/v1/crm/leads/${primaryLeadId}`)
      .set("Authorization", `Bearer ${writeToken}`);
    expect(deniedDetail.status).toBe(403);

    const deniedCustomFields = await request(app)
      .get("/api/connectors/v1/crm/custom-fields")
      .set("Authorization", `Bearer ${writeToken}`);
    expect(deniedCustomFields.status).toBe(403);

    const deniedRead = await request(app)
      .get("/api/connectors/v1/crm/leads")
      .set("Authorization", `Bearer ${writeToken}`);
    expect(deniedRead.status).toBe(403);

    const deniedPatch = await request(app)
      .patch(`/api/connectors/v1/crm/leads/${primaryLeadId}`)
      .set("Authorization", `Bearer ${readToken}`)
      .send({ status: "qualified" });
    expect(deniedPatch.status).toBe(403);

    const customFields = await request(app)
      .get("/api/connectors/v1/crm/custom-fields")
      .set("Authorization", `Bearer ${readToken}`);
    expect(customFields.status).toBe(200);
  });

  it("creates and updates leads with write scope and logs no lead content", async () => {
    const created = await request(app)
      .post("/api/connectors/v1/crm/leads")
      .set("Authorization", `Bearer ${writeToken}`)
      .send({ name: "External App Lead", email: "external@example.test", company: "Example" });
    expect(created.status).toBe(201);
    expect(created.body.lead).toMatchObject({
      name: "External App Lead",
      email: "external@example.test",
      source: expect.stringMatching(/^connector:/),
    });
    expect(created.body.lead).not.toHaveProperty("pabloNotesJson");

    const updated = await request(app)
      .patch(`/api/connectors/v1/crm/leads/${created.body.lead.id}`)
      .set("Authorization", `Bearer ${writeToken}`)
      .send({ status: "qualified", phone: "555-0199" });
    expect(updated.status).toBe(200);
    expect(updated.body.lead).toMatchObject({ status: "qualified", phone: "555-0199" });

    const rejectedAssignment = await request(app)
      .patch(`/api/connectors/v1/crm/leads/${created.body.lead.id}`)
      .set("Authorization", `Bearer ${writeToken}`)
      .send({ assignedUserId: userIds[0] });
    expect(rejectedAssignment.status).toBe(400);

    const events = await db.select().from(orgConnectorActivityTable)
      .where(eq(orgConnectorActivityTable.connectionId, writeConnectionId));
    expect(events.map((event) => event.eventType)).toContain("crm_lead_created");
    expect(events.map((event) => event.eventType)).toContain("crm_lead_updated");
    expect(events.map((event) => event.summary).join(" ")).not.toContain("External App Lead");
  });

  it("rejects the health and CRM endpoints after a token is revoked", async () => {
    await db.update(orgConnectorConnectionsTable).set({
      status: "revoked",
      tokenHash: null,
      tokenPrefix: null,
      revokedAt: new Date(),
    }).where(eq(orgConnectorConnectionsTable.id, revokeConnectionId));

    const health = await request(app)
      .get("/api/connectors/v1/whoami")
      .set("Authorization", `Bearer ${revokeToken}`);
    expect(health.status).toBe(401);

    const read = await request(app)
      .get("/api/connectors/v1/crm/leads")
      .set("Authorization", `Bearer ${revokeToken}`);
    expect(read.status).toBe(401);
  });
});
