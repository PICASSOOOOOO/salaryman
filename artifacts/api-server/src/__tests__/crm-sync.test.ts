import express from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  crmCustomFieldsTable,
  crmSourceConnectionsTable,
  crmSyncChangesTable,
  crmSyncConflictsTable,
  crmSyncRunsTable,
  leadRecordsTable,
  orgMembersTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../lib/site-proxy", () => ({ safeFetch: safeFetchMock }));

import crmSyncRouter from "../routes/crm-sync";
import crmAdaptiveRouter from "../routes/crm-adaptive";

type AuthState = { userId: string | null };

const auth: AuthState = { userId: null };
const organizationIds: number[] = [];
const userIds: string[] = [];
const originalEnv = {
  encryption: process.env.ORG_RECORDS_ENCRYPTION_KEY,
  googleClientId: process.env.GOOGLE_SHEETS_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_SHEETS_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_SHEETS_REDIRECT_URI,
};

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.isAuthenticated = () => Boolean(auth.userId);
  if (auth.userId) req.user = { id: auth.userId };
  next();
});
app.use("/api", crmSyncRouter, crmAdaptiveRouter);

async function createUser(email: string) {
  const [user] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id });
  userIds.push(user.id);
  return user.id;
}

async function createOrganization(name: string, ownerUserId: string) {
  const [organization] = await db.insert(organizationsTable).values({ name, ownerUserId }).returning({ id: organizationsTable.id });
  organizationIds.push(organization.id);
  await db.insert(orgMembersTable).values({ orgId: organization.id, userId: ownerUserId, role: "owner", status: "active" });
  return organization.id;
}

async function setCurrentOrg(userId: string, orgId: number) {
  await db.update(usersTable).set({ currentOrgId: String(orgId) }).where(eq(usersTable.id, userId));
}

const defaultMapping = { email: "email", name: "name", phone: "phone" };

async function createRestSource(options: {
  name?: string;
  direction?: "pull" | "push" | "bidirectional";
  endpoint?: string;
  method?: string;
  bearer?: string;
} = {}) {
  const response = await request(app).post("/api/crm/sources").send({
    provider: "rest",
    name: options.name ?? "Test REST source",
    direction: options.direction ?? "pull",
    config: {
      endpoint: options.endpoint ?? "https://source.example/contacts",
      method: options.method ?? "GET",
      mapping: defaultMapping,
      keyField: "email",
    },
    ...(options.bearer ? { auth: { bearer: options.bearer } } : {}),
  });
  expect(response.status).toBe(201);
  return response.body;
}

async function insertLead(input: { name: string; email: string }) {
  const [lead] = await db.insert(leadRecordsTable).values({
    orgId: primaryOrgId,
    createdByUserId: ownerUserId,
    source: "manual",
    status: "new",
    name: input.name,
    email: input.email,
    phone: "",
    company: "",
    jobTitle: "",
    customFieldsJson: {},
  }).returning();
  return lead;
}

let ownerUserId = "";
let primaryOrgId = 0;
let secondaryOrgId = 0;

beforeAll(async () => {
  process.env.ORG_RECORDS_ENCRYPTION_KEY = "crm-sync-tests-only";
  process.env.GOOGLE_SHEETS_CLIENT_ID = "crm-sync-test-client";
  process.env.GOOGLE_SHEETS_CLIENT_SECRET = "crm-sync-test-secret";
  process.env.GOOGLE_SHEETS_REDIRECT_URI = "https://salaryman.example/api/crm/google/callback";

  ownerUserId = await createUser(`crm-sync-${randomUUID()}@example.test`);
  primaryOrgId = await createOrganization(`CRM sync ${randomUUID()}`, ownerUserId);
  secondaryOrgId = await createOrganization(`CRM sync second ${randomUUID()}`, ownerUserId);
  await setCurrentOrg(ownerUserId, primaryOrgId);
  auth.userId = ownerUserId;
});

beforeEach(async () => {
  auth.userId = ownerUserId;
  await setCurrentOrg(ownerUserId, primaryOrgId);
  safeFetchMock.mockReset();
  safeFetchMock.mockResolvedValue({ status: 200, body: Buffer.from("{}") });
});

afterAll(async () => {
  auth.userId = null;
  if (organizationIds.length) {
    const orgIds = organizationIds;
    await db.delete(crmSyncConflictsTable).where(inArray(crmSyncConflictsTable.orgId, orgIds));
    await db.delete(crmSyncChangesTable).where(inArray(crmSyncChangesTable.orgId, orgIds));
    await db.delete(crmSyncRunsTable).where(inArray(crmSyncRunsTable.orgId, orgIds));
    await db.delete(crmCustomFieldsTable).where(inArray(crmCustomFieldsTable.orgId, orgIds));
    await db.delete(leadRecordsTable).where(inArray(leadRecordsTable.orgId, orgIds));
    await db.delete(crmSourceConnectionsTable).where(inArray(crmSourceConnectionsTable.orgId, orgIds));
    await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, orgIds));
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds));
  }
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  if (originalEnv.encryption === undefined) delete process.env.ORG_RECORDS_ENCRYPTION_KEY;
  else process.env.ORG_RECORDS_ENCRYPTION_KEY = originalEnv.encryption;
  if (originalEnv.googleClientId === undefined) delete process.env.GOOGLE_SHEETS_CLIENT_ID;
  else process.env.GOOGLE_SHEETS_CLIENT_ID = originalEnv.googleClientId;
  if (originalEnv.googleClientSecret === undefined) delete process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  else process.env.GOOGLE_SHEETS_CLIENT_SECRET = originalEnv.googleClientSecret;
  if (originalEnv.googleRedirectUri === undefined) delete process.env.GOOGLE_SHEETS_REDIRECT_URI;
  else process.env.GOOGLE_SHEETS_REDIRECT_URI = originalEnv.googleRedirectUri;
});

describe("organization CRM source sync", () => {
  it("keeps source credentials private and rejects non-HTTPS endpoints", async () => {
    const rejected = await request(app).post("/api/crm/sources").send({
      provider: "rest",
      config: { endpoint: "http://127.0.0.1/private", method: "GET", mapping: defaultMapping, keyField: "email" },
    });
    expect(rejected.status).toBe(400);
    expect(safeFetchMock).not.toHaveBeenCalled();

    const source = await createRestSource({
      endpoint: "https://source.example/contacts?access_token=query-secret",
      bearer: "crm-sync-private-bearer",
    });
    expect(JSON.stringify(source)).not.toContain("crm-sync-private-bearer");
    expect(JSON.stringify(source)).not.toContain("query-secret");

    const listed = await request(app).get("/api/crm/sources");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain("crm-sync-private-bearer");
    expect(JSON.stringify(listed.body)).not.toContain("query-secret");
    expect(listed.body.sources[0].credential).toBeTruthy();
    expect(listed.body.sources[0].configJson.endpoint).toBe("https://source.example/contacts");

    const archive = await request(app).get("/api/crm/archive/export");
    expect(archive.status).toBe(200);
    expect(JSON.stringify(archive.body)).not.toContain("crm-sync-private-bearer");
    expect(JSON.stringify(archive.body)).not.toContain("query-secret");
    const archivedSource = archive.body.sources.find((entry: any) => entry.id === source.id);
    expect(archivedSource.configJson.endpoint).toBe("https://source.example/contacts");
    expect(archivedSource).not.toHaveProperty("encryptedAuth");
    expect(archivedSource).not.toHaveProperty("oauthStateHash");
    expect(archivedSource).not.toHaveProperty("oauthStateExpiresAt");
  });

  it("limits source reads to the active organization", async () => {
    await createRestSource({ name: "Primary org source" });
    await setCurrentOrg(ownerUserId, secondaryOrgId);
    await createRestSource({ name: "Secondary org source" });

    const response = await request(app).get("/api/crm/sources");
    expect(response.status).toBe(200);
    expect(response.body.sources.map((source: any) => source.name)).toEqual(["Secondary org source"]);
    await setCurrentOrg(ownerUserId, primaryOrgId);
  });

  it("validates mixed core/custom imports per row and keeps imported contacts as leads", async () => {
    const fieldResponse = await request(app).post("/api/crm/custom-fields").send({
      fieldKey: "segment",
      label: "Segment",
      fieldType: "select",
      optionsJson: ["Tech", "Finance"],
      required: true,
    });
    expect(fieldResponse.status).toBe(201);

    const existing = await insertLead({ name: "Existing Contact", email: "existing-import@example.test" });
    const membersBefore = await db.select().from(orgMembersTable).where(eq(orgMembersTable.orgId, primaryOrgId));
    const response = await request(app).post("/api/crm/leads/import/apply").send({
      headers: ["Name", "Email", "Segment", "Status"],
      rows: [
        ["Bad status", "bad-status-import@example.test", "Tech", "pipeline"],
        ["Bad segment", "bad-segment-import@example.test", "Retail", "qualified"],
        ["Valid contact", "valid-import@example.test", "Tech", "qualified"],
        ["Duplicate contact", "valid-import@example.test", "Finance", "contacted"],
        ["Invalid update", existing.email, "Retail", "closed_won"],
      ],
      mapping: { Name: "name", Email: "email", Segment: "segment", Status: "status" },
      existingRowPolicy: "skip",
      authority: "import",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ created: 1, updated: 0, skipped: 1 });
    expect(response.body.errors.map((entry: any) => entry.row)).toEqual([1, 2, 5]);
    expect(response.body.errors[0].error).toContain("status");
    expect(response.body.errors[1].error).toContain("segment");

    const imported = await db.select().from(leadRecordsTable).where(and(
      eq(leadRecordsTable.orgId, primaryOrgId),
      inArray(leadRecordsTable.email, [
        "bad-status-import@example.test",
        "bad-segment-import@example.test",
        "valid-import@example.test",
      ]),
    ));
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      email: "valid-import@example.test",
      name: "Valid contact",
      status: "qualified",
      customFieldsJson: { segment: "Tech" },
    });

    const [unchangedExisting] = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.id, existing.id));
    expect(unchangedExisting).toMatchObject({ name: "Existing Contact", status: "new", customFieldsJson: {} });

    const update = await request(app).post("/api/crm/leads/import/apply").send({
      headers: ["Name", "Email", "Segment", "Status"],
      rows: [["Updated Contact", existing.email, "Finance", "closed_won"]],
      mapping: { Name: "name", Email: "email", Segment: "segment", Status: "status" },
      existingRowPolicy: "update",
      authority: "import",
    });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ created: 0, updated: 1 });

    const [updatedExisting] = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.id, existing.id));
    expect(updatedExisting).toMatchObject({
      name: "Updated Contact",
      status: "closed_won",
      customFieldsJson: { segment: "Finance" },
    });

    const membersAfter = await db.select().from(orgMembersTable).where(eq(orgMembersTable.orgId, primaryOrgId));
    expect(membersAfter).toHaveLength(membersBefore.length);
  });

  it("pulls REST contacts into the organization and records a baseline snapshot", async () => {
    const source = await createRestSource({ bearer: "crm-sync-sync-bearer" });
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify([{ email: "ada@example.test", name: "Ada Example", phone: "+1 555 0100" }])),
    });

    const response = await request(app).post(`/api/crm/sources/${source.id}/sync`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ created: 1, pulled: 1, conflicts: 0 });
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://source.example/contacts",
      expect.objectContaining({
        method: "GET",
        maxRedirects: 0,
        maxResponseBytes: 2 * 1024 * 1024,
        headers: expect.objectContaining({ authorization: "Bearer crm-sync-sync-bearer" }),
      }),
    );

    const [lead] = await db.select().from(leadRecordsTable).where(and(
      eq(leadRecordsTable.orgId, primaryOrgId),
      eq(leadRecordsTable.email, "ada@example.test"),
    ));
    expect(lead).toMatchObject({ name: "Ada Example", phone: "+1 555 0100", source: `rest:${source.id}` });
    const [snapshot] = await db.select().from(crmSyncChangesTable).where(and(
      eq(crmSyncChangesTable.orgId, primaryOrgId),
      eq(crmSyncChangesTable.connectionId, source.id),
      eq(crmSyncChangesTable.isSnapshot, true),
    ));
    expect(snapshot).toBeTruthy();
    expect(snapshot.sourceSnapshotJson).toMatchObject({ email: "ada@example.test", name: "Ada Example" });
  });

  it("records a durable baseline after a REST push", async () => {
    const lead = await insertLead({ name: "Exported contact", email: "exported@example.test" });
    const source = await createRestSource({ direction: "push", method: "POST" });
    const response = await request(app).post(`/api/crm/sources/${source.id}/sync`);

    expect(response.status).toBe(200);
    expect(response.body.pushed).toBeGreaterThan(0);
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://source.example/contacts",
      expect.objectContaining({ method: "POST", maxRedirects: 0 }),
    );
    const [snapshot] = await db.select().from(crmSyncChangesTable).where(and(
      eq(crmSyncChangesTable.orgId, primaryOrgId),
      eq(crmSyncChangesTable.connectionId, source.id),
      eq(crmSyncChangesTable.externalKey, lead.email),
      eq(crmSyncChangesTable.isSnapshot, true),
    ));
    expect(snapshot.crmSnapshotJson).toMatchObject({ email: lead.email, name: lead.name });
  });

  it("creates an explicit bidirectional conflict and applies the selected winner", async () => {
    const source = await createRestSource({ direction: "bidirectional", method: "POST" });
    const lead = await insertLead({ name: "CRM version", email: "conflict@example.test" });
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify([{ email: lead.email, name: "Source version", phone: "" }])),
    });

    const sync = await request(app).post(`/api/crm/sources/${source.id}/sync`);
    expect(sync.status).toBe(200);
    expect(sync.body.conflicts).toBe(1);

    const open = await request(app).get("/api/crm/sync/conflicts");
    expect(open.status).toBe(200);
    expect(open.body.conflicts).toHaveLength(1);
    const conflict = open.body.conflicts[0];
    expect(conflict.sourceSnapshotJson.name).toBe("Source version");
    expect(conflict.crmSnapshotJson.name).toBe("CRM version");

    const resolved = await request(app).post(`/api/crm/sync/conflicts/${conflict.id}/resolve`).send({ resolution: "source" });
    expect(resolved.status).toBe(200);
    const [updatedLead] = await db.select().from(leadRecordsTable).where(eq(leadRecordsTable.id, lead.id));
    expect(updatedLead.name).toBe("Source version");
    const [savedConflict] = await db.select().from(crmSyncConflictsTable).where(eq(crmSyncConflictsTable.id, conflict.id));
    expect(savedConflict).toMatchObject({ status: "resolved", resolution: "source" });
  });

  it("pushes the CRM winner on conflict resolution and keeps Google OAuth state single-use", async () => {
    const source = await createRestSource({ direction: "bidirectional", method: "POST" });
    const lead = await insertLead({ name: "Keep this CRM value", email: "crm-winner@example.test" });
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify([{ email: lead.email, name: "Old source value", phone: "" }])),
    });

    const sync = await request(app).post(`/api/crm/sources/${source.id}/sync`);
    expect(sync.status).toBe(200);
    const [conflict] = await db.select().from(crmSyncConflictsTable).where(and(
      eq(crmSyncConflictsTable.orgId, primaryOrgId),
      eq(crmSyncConflictsTable.connectionId, source.id),
      eq(crmSyncConflictsTable.status, "open"),
    ));
    safeFetchMock.mockResolvedValueOnce({ status: 200, body: Buffer.from("{}") });

    const resolved = await request(app).post(`/api/crm/sync/conflicts/${conflict.id}/resolve`).send({ resolution: "crm" });
    expect(resolved.status).toBe(200);
    const resolutionCall = safeFetchMock.mock.calls.at(-1);
    expect(resolutionCall?.[1]).toMatchObject({ method: "POST", maxRedirects: 0 });
    expect(resolutionCall?.[1].body).toContain("Keep this CRM value");

    const googleSource = await request(app).post("/api/crm/sources").send({
      provider: "google_sheets",
      name: "OAuth test sheet",
      direction: "bidirectional",
      config: {
        spreadsheetId: "spreadsheet_test_123456",
        range: "Contacts!A1:Z",
        mapping: { email: "Email", name: "Name" },
        keyField: "email",
      },
    });
    expect(googleSource.status).toBe(201);
    const connect = await request(app).get("/api/crm/google/connect").query({ sourceId: googleSource.body.id });
    expect(connect.status).toBe(200);
    const state = new URL(connect.body.authorizationUrl).searchParams.get("state");
    expect(state).toBeTruthy();
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 })),
    });

    const callback = await request(app).get("/api/crm/google/callback").query({ code: "test-code", state });
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe("/leads?crm_google_sheets=connected");
    const replay = await request(app).get("/api/crm/google/callback").query({ code: "test-code", state });
    expect(replay.status).toBe(400);

    const cancelConnect = await request(app).get("/api/crm/google/connect").query({ sourceId: googleSource.body.id });
    const cancelState = new URL(cancelConnect.body.authorizationUrl).searchParams.get("state");
    const cancelled = await request(app).get("/api/crm/google/callback").query({ error: "access_denied", state: cancelState });
    expect(cancelled.status).toBe(303);
    expect(cancelled.headers.location).toBe("/leads?crm_google_sheets=cancelled");
    const cancelledReplay = await request(app).get("/api/crm/google/callback").query({ code: "test-code", state: cancelState });
    expect(cancelledReplay.status).toBe(400);

    const listed = await request(app).get("/api/crm/sources");
    expect(JSON.stringify(listed.body)).not.toContain("test-access");
    expect(JSON.stringify(listed.body)).not.toContain("test-refresh");
    expect(listed.body.sources.find((entry: any) => entry.id === googleSource.body.id).credential).toBeTruthy();

    const baselineRun = await db.insert(crmSyncRunsTable).values({
      orgId: primaryOrgId,
      connectionId: googleSource.body.id,
      direction: "bidirectional",
      status: "completed",
      completedAt: new Date(),
      summaryJson: {},
    }).returning();
    const crmWinnerLead = (await db.select().from(leadRecordsTable).where(and(
      eq(leadRecordsTable.orgId, primaryOrgId),
      eq(leadRecordsTable.email, "crm-winner@example.test"),
    )))[0];
    await db.insert(crmSyncChangesTable).values({
      orgId: primaryOrgId,
      runId: baselineRun[0].id,
      connectionId: googleSource.body.id,
      leadId: crmWinnerLead.id,
      externalKey: crmWinnerLead.email,
      changedFieldsJson: {},
      sourceSnapshotJson: { email: crmWinnerLead.email, name: "Old source value" },
      crmSnapshotJson: { email: crmWinnerLead.email, name: "Old source value" },
      isSnapshot: true,
    });

    safeFetchMock.mockReset();
    safeFetchMock.mockResolvedValue({ status: 200, body: Buffer.from("{}") });
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify({ values: [["Email", "Name"], [crmWinnerLead.email, "Old source value"]] })),
    });
    const sheetSync = await request(app).post(`/api/crm/sources/${googleSource.body.id}/sync`);
    expect(sheetSync.status).toBe(200);
    expect(sheetSync.body.conflicts).toBe(0);
    const batchCall = safeFetchMock.mock.calls.find((call: any[]) => String(call[0]).endsWith("/values:batchUpdate"));
    if (!batchCall) throw new Error("Google Sheets sync did not issue a row-level batch update");
    expect(batchCall[1].method).toBe("POST");
    expect(batchCall[1].body).toContain("Contacts!B2");
    expect(batchCall[1].body).toContain("Keep this CRM value");
  });

  it("returns actionable Google Sheets sync errors without storing provider payloads", async () => {
    const googleSource = await request(app).post("/api/crm/sources").send({
      provider: "google_sheets",
      name: "Permission diagnostic sheet",
      direction: "pull",
      config: {
        spreadsheetId: "spreadsheet_diagnostic_123",
        range: "Contacts!A1:Z",
        mapping: { email: "Email", name: "Name" },
        keyField: "email",
      },
    });
    expect(googleSource.status).toBe(201);

    const connect = await request(app).get("/api/crm/google/connect").query({ sourceId: googleSource.body.id });
    const state = new URL(connect.body.authorizationUrl).searchParams.get("state");
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      body: Buffer.from(JSON.stringify({ access_token: "diagnostic-access", refresh_token: "diagnostic-refresh", expires_in: 3600 })),
    });
    const callback = await request(app).get("/api/crm/google/callback").query({ code: "diagnostic-code", state });
    expect(callback.status).toBe(303);

    safeFetchMock.mockReset();
    safeFetchMock.mockResolvedValue({
      status: 403,
      body: Buffer.from(JSON.stringify({
        error: { message: "provider-private-detail", access_token: "provider-private-token" },
      })),
    });
    const sync = await request(app).post(`/api/crm/sources/${googleSource.body.id}/sync`);
    expect(sync.status).toBe(502);
    expect(sync.body.error).toContain("Google denied access");
    expect(JSON.stringify(sync.body)).not.toContain("provider-private-detail");
    expect(JSON.stringify(sync.body)).not.toContain("provider-private-token");

    const [run] = await db.select().from(crmSyncRunsTable).where(eq(crmSyncRunsTable.connectionId, googleSource.body.id));
    expect(run.status).toBe("failed");
    expect(run.summaryJson.error).toBe(sync.body.error);
    expect(JSON.stringify(run.summaryJson)).not.toContain("provider-private-detail");
  });
});