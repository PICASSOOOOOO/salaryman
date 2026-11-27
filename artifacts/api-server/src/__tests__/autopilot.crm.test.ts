import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const { creditOrgAccountMock, resendSendMock } = vi.hoisted(() => ({
  creditOrgAccountMock: vi.fn(async () => {}),
  resendSendMock: vi.fn(async () => ({ data: { id: "email_test_1" }, error: null })),
}));

// Both providers are mocked so no real email or SMS is ever sent or charged.
vi.mock("twilio", async () => (await import("./helpers/twilioMock")).makeTwilioMock());
vi.mock("../lib/resend", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: resendSendMock } },
    fromEmail: "SALARYMAN <noreply@example.test>",
  })),
}));
vi.mock("../routes/org-accounts", () => ({
  creditOrgAccount: creditOrgAccountMock,
}));

import twilio from "twilio";
import { randomUUID } from "crypto";
import {
  db,
  autopilotActivityLogTable,
  contactsTable,
  contactChannelPrefsTable,
  leadRecordsTable,
  leadNotesTable,
  crmActivitiesTable,
  smsConversationsTable,
  smsMessagesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { crmCallsAutopilotHandler } from "../lib/autopilot/crm-handler";
import type { AutopilotContext, AutopilotLogInput } from "../lib/autopilot/types";

// The handler intentionally does not require the old phone-system entitlement.
let entitled = true;

// Unique synthetic identifiers so this file's rows never collide with others.
const OWNER_ID = `test-crm-ap-${randomUUID()}`;
// A high random org id avoids clashing with seeded orgs in the shared dev DB.
const ORG_ID = 900_000_000 + Math.floor(Math.random() * 90_000_000);
const previousSessionSecret = process.env.SESSION_SECRET;

const twilioSpies = twilio as unknown as { __spies: Record<string, ReturnType<typeof vi.fn>> };

/** Build a handler context with a captured log + a finite action budget. */
function makeCtx(maxActions: number): { ctx: AutopilotContext; logs: AutopilotLogInput[]; actionsUsed: () => number } {
  const logs: AutopilotLogInput[] = [];
  let used = 0;
  const ctx: AutopilotContext = {
    orgId: ORG_ID,
    domain: "crm_calls",
    config: {} as AutopilotContext["config"],
    assistantName: "Pablo Prime",
    ownerId: OWNER_ID,
    ownerEmail: "crm-ap@example.test",
    maxActions,
    async log(input) {
      logs.push(input);
    },
    claimAction() {
      if (used >= maxActions) return false;
      used++;
      return true;
    },
    async ensureEntitlement() {
      return entitled;
    },
    async ensureCredit() {
      return true;
    },
  };
  return { ctx, logs, actionsUsed: () => used };
}

async function seedLead(over: Partial<typeof leadRecordsTable.$inferInsert> = {}) {
  const [lead] = await db
    .insert(leadRecordsTable)
    .values({
      orgId: ORG_ID,
      name: "Test Lead",
      phone: `+1555${Math.floor(1000000 + Math.random() * 8999999)}`,
      email: `lead-${randomUUID()}@example.test`,
      status: "new",
      createdByUserId: OWNER_ID,
      assignedUserId: OWNER_ID,
      ...over,
    })
    .returning();
  return lead;
}

async function cleanup() {
  await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, ORG_ID)).catch(() => {});
  // crm_activities / lead_notes reference leads — clear children, then leads.
  await db.delete(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, ORG_ID)).catch(() => {});
  const leads = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable).where(eq(leadRecordsTable.orgId, ORG_ID));
  for (const l of leads) {
    await db.delete(leadNotesTable).where(eq(leadNotesTable.leadId, l.id)).catch(() => {});
  }
  await db.delete(leadRecordsTable).where(eq(leadRecordsTable.orgId, ORG_ID)).catch(() => {});
  const contacts = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.userId, OWNER_ID));
  for (const contact of contacts) {
    await db.delete(contactChannelPrefsTable).where(and(
      eq(contactChannelPrefsTable.userId, OWNER_ID),
      eq(contactChannelPrefsTable.contactId, contact.id),
    )).catch(() => {});
  }
  await db.delete(contactsTable).where(eq(contactsTable.userId, OWNER_ID)).catch(() => {});
  const convs = await db.select({ id: smsConversationsTable.id }).from(smsConversationsTable).where(eq(smsConversationsTable.userId, OWNER_ID));
  for (const c of convs) {
    await db.delete(smsMessagesTable).where(eq(smsMessagesTable.conversationId, c.id)).catch(() => {});
  }
  await db.delete(smsConversationsTable).where(eq(smsConversationsTable.userId, OWNER_ID)).catch(() => {});
}

beforeAll(async () => {
  process.env.SESSION_SECRET = "test-autopilot-email-opt-out-secret";
  await cleanup();
});
beforeEach(async () => {
  entitled = true;
  vi.clearAllMocks();
  resendSendMock.mockResolvedValue({ data: { id: "email_test_1" }, error: null });
  // Each case starts from a clean slate so rows from a prior case (same ORG_ID)
  // never leak into another's assertions.
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSessionSecret;
});

describe("CRM autopilot handler", () => {
  it("sends email for a due lead and records it to the CRM timeline and autopilot log", async () => {
    const lead = await seedLead({ name: "Ada Lovelace", status: "new" });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    // Automated customer outreach uses email and never calls Twilio.
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(resendSendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: lead.email,
      subject: "A quick follow-up",
      text: expect.stringContaining("Thanks for your interest"),
      html: expect.stringContaining("/api/campaigns/email/unsubscribe?"),
    }));
    expect(twilioSpies.__spies.messagesCreate).not.toHaveBeenCalled();
    expect(twilioSpies.__spies.callsCreate).not.toHaveBeenCalled();

    // CRM activity is attributed to the email channel.
    const activities = await db
      .select()
      .from(crmActivitiesTable)
      .where(and(eq(crmActivitiesTable.orgId, ORG_ID), eq(crmActivitiesTable.leadId, lead.id)));
    expect(activities.length).toBe(1);
    expect(activities[0].channel).toBe("email");
    expect(activities[0].direction).toBe("outbound");

    // The lead timeline also records the outgoing email.
    const notes = await db.select().from(leadNotesTable).where(eq(leadNotesTable.leadId, lead.id));
    expect(notes.length).toBe(1);
    expect(notes[0].note).toContain("[Outbound email]");

    // Autopilot activity log has a success touch + a tick summary.
    expect(logs.some((l) => l.action === "email_followup" && l.outcome === "success")).toBe(true);
    expect(logs.some((l) => l.action === "tick")).toBe(true);
    expect(creditOrgAccountMock).not.toHaveBeenCalled();
  });

  it("skips leads contacted within the follow-up window (per-lead cap)", async () => {
    const lead = await seedLead({ name: "Recent Lead", status: "contacted" });
    // Pre-seed a recent outbound activity so the lead is NOT due.
    await db.insert(crmActivitiesTable).values({
      orgId: ORG_ID,
      userId: OWNER_ID,
      leadId: lead.id,
      channel: "sms",
      direction: "outbound",
      phone: lead.phone,
      occurredAt: new Date(),
    });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    // No new email sent for this just-contacted lead.
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(twilioSpies.__spies.messagesCreate).not.toHaveBeenCalled();
    expect(logs.some((l) => l.action === "email_followup")).toBe(false);
    expect(logs.some((l) => l.action === "tick" && l.outcome === "noop")).toBe(true);
  });

  it("never auto-contacts closed leads", async () => {
    await seedLead({ name: "Closed Won", status: "closed_won" });
    await seedLead({ name: "Closed Lost", status: "closed_lost" });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    expect(logs.some((l) => l.action === "email_followup")).toBe(false);
    const activities = await db.select().from(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, ORG_ID));
    expect(activities.length).toBe(0);
  });

  it("suppresses CRM follow-ups for leads whose saved contact opted out of email", async () => {
    const lead = await seedLead({ name: "Opted Out", status: "new" });
    const [contact] = await db.insert(contactsTable).values({
      userId: OWNER_ID,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    }).returning();
    await db.insert(contactChannelPrefsTable).values({
      userId: OWNER_ID,
      contactId: contact.id,
      emailOptIn: false,
      emailOptedOutAt: new Date(),
    });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(twilioSpies.__spies.messagesCreate).not.toHaveBeenCalled();
    expect(logs.some((l) => l.action === "email_followup")).toBe(false);
    const tick = logs.find((l) => l.action === "tick");
    expect(tick?.detail?.emailOptedOut).toBe(1);
  });

  it("backs off after a failed email attempt instead of retrying every tick", async () => {
    const lead = await seedLead({ name: "Temporary Provider Failure", status: "new" });
    const firstRun = makeCtx(5);
    resendSendMock.mockResolvedValueOnce({ data: null, error: { message: "Resend unavailable" } } as any);

    await crmCallsAutopilotHandler(firstRun.ctx);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(firstRun.logs.some((l) => l.action === "email_followup" && l.outcome === "error")).toBe(true);
    await db.insert(autopilotActivityLogTable).values({
      orgId: ORG_ID,
      domain: "crm_calls",
      action: "email_followup",
      summary: "Failed to send an email follow-up.",
      outcome: "error",
      detail: { leadId: lead.id, channel: "email" },
    });

    const secondRun = makeCtx(5);
    await crmCallsAutopilotHandler(secondRun.ctx);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(secondRun.logs.some((l) => l.action === "email_followup")).toBe(false);
  });

  it("respects the per-tick action cap", async () => {
    await seedLead({ name: "L1", status: "new" });
    await seedLead({ name: "L2", status: "new" });
    await seedLead({ name: "L3", status: "new" });
    const { ctx, logs } = makeCtx(2);

    await crmCallsAutopilotHandler(ctx);

    const sent = logs.filter((l) => l.action === "email_followup" && l.outcome === "success").length;
    expect(sent).toBe(2);
  });

  it("sends email without a phone-system entitlement", async () => {
    entitled = false;
    await seedLead({ name: "Email Without Phone Plan", status: "new" });
    const { ctx } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(twilioSpies.__spies.messagesCreate).not.toHaveBeenCalled();
  });
});
