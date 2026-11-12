import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  autopilotReviewItemsTable,
  businessTasksTable,
  callHistoryTable,
  crmActivitiesTable,
  db,
  leadRecordsTable,
} from "@workspace/db";
import {
  actAs,
  buildApp,
  cleanupTestData,
  createOrg,
  createUser,
  setAuthed,
} from "./helpers/autopilotTestApp";

let app: Express;

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  setAuthed(true);
});

afterAll(async () => {
  await cleanupTestData();
});

async function createCompletedCrmCall(ownerId: string, orgId: number, leadName: string) {
  const [lead] = await db.insert(leadRecordsTable).values({
    orgId,
    createdByUserId: ownerId,
    name: leadName,
    phone: "+15550001234",
    status: "qualified",
  }).returning();
  const callSid = `CA${randomUUID().replaceAll("-", "")}`;
  const [call] = await db.insert(callHistoryTable).values({
    userId: ownerId,
    orgId,
    callerName: leadName,
    recipientNumber: lead.phone,
    twilioCallSid: callSid,
    status: "completed",
    direction: "outbound",
    summary: "Requested a short proposal by Friday.",
    startedAt: new Date(),
  }).returning();
  await db.insert(crmActivitiesTable).values({
    orgId,
    userId: ownerId,
    leadId: lead.id,
    channel: "call",
    direction: "outbound",
    phone: lead.phone,
    contactName: leadName,
    summary: call.summary,
    twilioSid: callSid,
  });
  return { call, lead };
}

describe("Autopilot business brief and post-call approval queue", () => {
  it("reports organization activity without finance fields and creates an internal task only after approval", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);
    const { call } = await createCompletedCrmCall(owner.id, orgId, "Acme contact");
    await db.insert(callHistoryTable).values({
      userId: owner.id,
      orgId,
      callerName: "Non-CRM call",
      recipientNumber: "+15550005678",
      twilioCallSid: `CA${randomUUID().replaceAll("-", "")}`,
      status: "completed",
      direction: "outbound",
      summary: "This call has no CRM activity.",
      startedAt: new Date(),
    });

    const brief = await request(app).get("/api/autopilot/brief");
    expect(brief.status).toBe(200);
    expect(brief.body.newLeads).toBe(1);
    expect(brief.body.activeLeads).toBe(1);
    expect(brief.body.calls).toEqual({ total: 2, inbound: 0, outbound: 2 });
    expect(brief.body.recentCalls[0]).toMatchObject({
      id: call.id,
      leadName: "Acme contact",
      hasProposal: false,
      proposalStatus: null,
    });
    expect(brief.body).not.toHaveProperty("revenue");
    expect(brief.body).not.toHaveProperty("finance");

    const suggestion = await request(app)
      .post("/api/autopilot/follow-up-suggestions")
      .send({ callHistoryId: call.id });
    expect(suggestion.status).toBe(200);
    expect(suggestion.body.duplicate).toBe(false);
    expect(suggestion.body.item).toMatchObject({
      sourceLeadName: "Acme contact",
      taskTitle: "Follow up with Acme contact after call",
      status: "pending",
    });

    const duplicate = await request(app)
      .post("/api/autopilot/follow-up-suggestions")
      .send({ callHistoryId: call.id });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(duplicate.body.item.id).toBe(suggestion.body.item.id);

    const briefAfterDraft = await request(app).get("/api/autopilot/brief");
    expect(briefAfterDraft.body.pendingApprovals).toBe(1);
    expect(briefAfterDraft.body.recentCalls[0].proposalStatus).toBe("pending");

    const queue = await request(app).get("/api/autopilot/approval-queue");
    expect(queue.status).toBe(200);
    expect(queue.body.items).toHaveLength(1);

    const approval = await request(app)
      .post(`/api/autopilot/approval-queue/${suggestion.body.item.id}/decision`)
      .send({ decision: "approved" });
    expect(approval.status).toBe(200);
    expect(approval.body.item.status).toBe("approved");
    const [task] = await db.select().from(businessTasksTable)
      .where(eq(businessTasksTable.id, approval.body.businessTaskId));
    expect(task).toMatchObject({
      userId: owner.id,
      title: "Follow up with Acme contact after call",
      status: "todo",
      tags: "pablo-follow-up",
    });
    const repeatedDecision = await request(app)
      .post(`/api/autopilot/approval-queue/${suggestion.body.item.id}/decision`)
      .send({ decision: "approved" });
    expect(repeatedDecision.status).toBe(409);
  });

  it("rejects cross-organization call IDs and lets dismissal leave tasks untouched", async () => {
    const owner = await createUser();
    const otherOwner = await createUser();
    const orgId = await createOrg(owner.id);
    const otherOrgId = await createOrg(otherOwner.id);
    const { call: ownCall } = await createCompletedCrmCall(owner.id, orgId, "Own lead");
    const { call: foreignCall } = await createCompletedCrmCall(otherOwner.id, otherOrgId, "Foreign lead");
    actAs(owner);

    const foreignSuggestion = await request(app)
      .post("/api/autopilot/follow-up-suggestions")
      .send({ callHistoryId: foreignCall.id });
    expect(foreignSuggestion.status).toBe(404);

    const suggestion = await request(app)
      .post("/api/autopilot/follow-up-suggestions")
      .send({ callHistoryId: ownCall.id });
    expect(suggestion.status).toBe(200);
    const dismiss = await request(app)
      .post(`/api/autopilot/approval-queue/${suggestion.body.item.id}/decision`)
      .send({ decision: "dismissed" });
    expect(dismiss.status).toBe(200);
    expect(dismiss.body.item.status).toBe("dismissed");
    expect(dismiss.body.businessTaskId).toBeNull();
    expect(await db.select().from(businessTasksTable).where(eq(businessTasksTable.userId, owner.id))).toHaveLength(0);

    const [stored] = await db.select().from(autopilotReviewItemsTable)
      .where(eq(autopilotReviewItemsTable.id, suggestion.body.item.id));
    expect(stored?.businessTaskId).toBeNull();
  });

  it("enforces Autopilot organization permission and authentication on the read-only brief", async () => {
    const owner = await createUser();
    const specialist = await createUser();
    await createOrg(owner.id, [{ userId: specialist.id, role: "specialist" }]);
    actAs(specialist);
    expect((await request(app).get("/api/autopilot/brief")).status).toBe(403);

    setAuthed(false);
    expect((await request(app).get("/api/autopilot/approval-queue")).status).toBe(401);
  });
});
