import express from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  db,
  crmActivitiesTable,
  leadRecordsTable,
  orgDocumentsTable,
  orgConnectorActivityTable,
  orgConnectorAppsTable,
  orgConnectorConnectionsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { createOrgConnectorToken, hashOrgConnectorToken } from "../lib/org-connectors";
import orgConnectorCrmRouter from "../routes/org-connector-crm";
import orgConnectorCallsRouter from "../routes/org-connector-calls";
import orgConnectorDocumentsRouter from "../routes/org-connector-documents";
import orgConnectorsRouter from "../routes/org-connectors";

const storageFixture = vi.hoisted(() => ({ size: "7", contentType: "text/plain" }));
vi.mock("../lib/objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class {
    async getObjectEntityUploadURL(id: string) {
      return `https://storage.googleapis.com/test-bucket/uploads/${id}`;
    }
    normalizeObjectEntityPath(url: string) {
      return `/objects/uploads/${url.split("/").at(-1)}`;
    }
    async getObjectEntityFile() {
      return {
        getMetadata: async () => [{ size: storageFixture.size, contentType: storageFixture.contentType }],
      };
    }
    async copyUploadToOrganizationDocument(_path: string, id: string) {
      return `/objects/organization-documents/${id}`;
    }
    async deleteObject() { return true; }
  },
}));

const app = express();
app.use(express.json());
app.use("/api", orgConnectorsRouter, orgConnectorCrmRouter, orgConnectorCallsRouter, orgConnectorDocumentsRouter);

const userIds: string[] = [];
const orgIds: number[] = [];
const appIds: number[] = [];

let primaryOrgId = 0;
let secondaryOrgId = 0;
let readToken = "";
let writeToken = "";
let revokeToken = "";
let callReadToken = "";
let documentReadToken = "";
let documentWriteToken = "";
let writeConnectionId = 0;
let revokeConnectionId = 0;
let primaryLeadId = 0;
let secondaryLeadId = 0;
let primaryCallId = 0;
let secondaryCallId = 0;
let primaryDocumentId = 0;
let secondaryDocumentId = 0;

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

async function createCallActivity(orgId: number, userId: string, leadId: number, contactName: string) {
  const [activity] = await db.insert(crmActivitiesTable).values({
    orgId,
    userId,
    leadId,
    channel: "call",
    direction: "outbound",
    phone: "555-0111",
    contactName,
    body: "private message content",
    summary: "private call summary",
    recordingUrl: "https://recordings.example/private.wav",
    durationSeconds: 94,
    status: "completed",
    twilioSid: `CA${randomUUID().replace(/-/g, "")}`,
  }).returning({ id: crmActivitiesTable.id });
  return activity.id;
}

beforeAll(async () => {
  const ownerA = await createUser();
  const ownerB = await createUser();
  primaryOrgId = await createOrg(ownerA);
  secondaryOrgId = await createOrg(ownerB);

  const readConnection = await createConnection(primaryOrgId, ["crm:read"]);
  readToken = readConnection.token;
  callReadToken = (await createConnection(primaryOrgId, ["calls:read"])).token;
  const writeConnection = await createConnection(primaryOrgId, ["crm:write"]);
  writeToken = writeConnection.token;
  writeConnectionId = writeConnection.connectionId;
  const revokedConnection = await createConnection(primaryOrgId, ["crm:read"]);
  revokeToken = revokedConnection.token;
  revokeConnectionId = revokedConnection.connectionId;
  documentReadToken = (await createConnection(primaryOrgId, ["documents:read"])).token;
  documentWriteToken = (await createConnection(primaryOrgId, ["documents:write"])).token;

  primaryLeadId = await createLead(primaryOrgId, ownerA, "Primary Org Lead");
  secondaryLeadId = await createLead(secondaryOrgId, ownerB, "Secondary Org Lead");
  primaryCallId = await createCallActivity(primaryOrgId, ownerA, primaryLeadId, "Primary Private Contact");
  secondaryCallId = await createCallActivity(secondaryOrgId, ownerB, secondaryLeadId, "Foreign Private Contact");
  const [primaryDocument] = await db.insert(orgDocumentsTable).values({
    orgId: primaryOrgId,
    name: "Organization brief",
    isFolder: false,
    objectPath: "/objects/private/primary",
    mimeType: "text/plain",
    fileSize: 7,
    uploadedByUserId: ownerA,
  }).returning({ id: orgDocumentsTable.id });
  const [secondaryDocument] = await db.insert(orgDocumentsTable).values({
    orgId: secondaryOrgId,
    name: "Foreign brief",
    isFolder: false,
    objectPath: "/objects/private/secondary",
    mimeType: "text/plain",
    fileSize: 7,
    uploadedByUserId: ownerB,
  }).returning({ id: orgDocumentsTable.id });
  primaryDocumentId = primaryDocument.id;
  secondaryDocumentId = secondaryDocument.id;
});

afterAll(async () => {
  if (orgIds.length) {
    await db.delete(orgConnectorActivityTable).where(inArray(orgConnectorActivityTable.orgId, orgIds));
    await db.delete(orgConnectorConnectionsTable).where(inArray(orgConnectorConnectionsTable.orgId, orgIds));
    await db.delete(crmActivitiesTable).where(inArray(crmActivitiesTable.orgId, orgIds));
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

  it("returns only safe call metadata for the token organization", async () => {
    const response = await request(app)
      .get("/api/connectors/v1/calls?limit=10")
      .set("Authorization", `Bearer ${callReadToken}`);

    expect(response.status).toBe(200);
    expect(response.body.activities.map((activity: { id: number }) => activity.id)).toContain(primaryCallId);
    expect(response.body.activities.map((activity: { id: number }) => activity.id)).not.toContain(secondaryCallId);
    expect(response.body.activities[0]).toMatchObject({
      channel: "call",
      direction: "outbound",
      status: "completed",
      durationSeconds: 94,
    });
    for (const forbidden of [
      "phone",
      "contactName",
      "body",
      "summary",
      "recordingUrl",
      "twilioSid",
    ]) {
      expect(response.body.activities[0]).not.toHaveProperty(forbidden);
    }
    expect(response.text).not.toContain("555-0111");
    expect(response.text).not.toContain("Primary Private Contact");
    expect(response.text).not.toContain("private call summary");
    expect(response.text).not.toContain("private.wav");

    const wrongScope = await request(app)
      .get("/api/connectors/v1/calls")
      .set("Authorization", `Bearer ${readToken}`);
    expect(wrongScope.status).toBe(403);

    const foreignLead = await request(app)
      .get(`/api/connectors/v1/calls?leadId=${secondaryLeadId}`)
      .set("Authorization", `Bearer ${callReadToken}`);
    expect(foreignLead.status).toBe(404);
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

  it("scopes organization document reads and omits storage paths and uploader identity", async () => {
    const listed = await request(app)
      .get("/api/connectors/v1/documents")
      .set("Authorization", `Bearer ${documentReadToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.documents.map((item: { id: number }) => item.id)).toContain(primaryDocumentId);
    expect(listed.body.documents.map((item: { id: number }) => item.id)).not.toContain(secondaryDocumentId);
    expect(listed.text).not.toContain("/objects/private");
    expect(listed.text).not.toContain(userIds[0]);
    expect(listed.body.documents[0]).not.toHaveProperty("uploadedByUserId");

    const foreign = await request(app)
      .get(`/api/connectors/v1/documents/${secondaryDocumentId}`)
      .set("Authorization", `Bearer ${documentReadToken}`);
    expect(foreign.status).toBe(404);

    const wrongScope = await request(app)
      .get("/api/connectors/v1/documents")
      .set("Authorization", `Bearer ${readToken}`);
    expect(wrongScope.status).toBe(403);
  });

  it("creates idempotent upload intents, verifies completion, and logs no file details", async () => {
    const body = { name: "Notes.txt", contentType: "text/plain", size: 7 };
    const first = await request(app)
      .post("/api/connectors/v1/documents/uploads")
      .set("Authorization", `Bearer ${documentWriteToken}`)
      .set("Idempotency-Key", "upload-notes-1")
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body).toHaveProperty("uploadId");
    expect(first.body).not.toHaveProperty("objectPath");

    const retry = await request(app)
      .post("/api/connectors/v1/documents/uploads")
      .set("Authorization", `Bearer ${documentWriteToken}`)
      .set("Idempotency-Key", "upload-notes-1")
      .send(body);
    expect(retry.status).toBe(200);
    expect(retry.body.uploadId).toBe(first.body.uploadId);

    const complete = await request(app)
      .post(`/api/connectors/v1/documents/uploads/${first.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${documentWriteToken}`)
      .send({});
    expect(complete.status).toBe(201);
    expect(complete.body.document).toMatchObject({ name: "Notes.txt", mimeType: "text/plain", fileSize: 7 });
    expect(complete.body.document).not.toHaveProperty("objectPath");
    expect(complete.body.document).not.toHaveProperty("uploadedByUserId");

    const retryComplete = await request(app)
      .post(`/api/connectors/v1/documents/uploads/${first.body.uploadId}/complete`)
      .set("Authorization", `Bearer ${documentWriteToken}`)
      .send({});
    expect(retryComplete.status).toBe(200);
    expect(retryComplete.body.document.id).toBe(complete.body.document.id);

    const events = await db.select().from(orgConnectorActivityTable)
      .where(eq(orgConnectorActivityTable.orgId, primaryOrgId));
    expect(events.map((event) => event.eventType)).toContain("org_document_uploaded");
    expect(events.map((event) => event.summary).join(" ")).not.toContain("Notes.txt");
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
