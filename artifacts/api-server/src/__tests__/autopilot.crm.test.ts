import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Twilio is mocked so no real SMS is ever sent or charged.
vi.mock("twilio", async () => (await import("./helpers/twilioMock")).makeTwilioMock());
// Entitlement gate is the only plan check on this path; flip per-test via mockState.
vi.mock("../lib/plan", async (importActual) => ({
  ...(await importActual<typeof import("../lib/plan")>()),
  hasFeature: vi.fn(async () => entitled),
}));
vi.mock("../lib/platform-twilio-access", () => ({
  canUsePlatformTwilio: vi.fn(async () => true),
}));

import twilio from "twilio";
import { randomUUID } from "crypto";
import {
  db,
  leadRecordsTable,
  leadNotesTable,
  crmActivitiesTable,
  smsConversationsTable,
  smsMessagesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { crmCallsAutopilotHandler } from "../lib/autopilot/crm-handler";
import type { AutopilotContext, AutopilotLogInput } from "../lib/autopilot/types";

// Mutable entitlement the mocked hasFeature reads at call-time.
let entitled = true;

// Unique synthetic identifiers so this file's rows never collide with others.
const OWNER_ID = `test-crm-ap-${randomUUID()}`;
// A high random org id avoids clashing with seeded orgs in the shared dev DB.
const ORG_ID = 900_000_000 + Math.floor(Math.random() * 90_000_000);

const twilioSpies = twilio as unknown as { __spies: Record<string, ReturnType<typeof vi.fn>> };

/** Build a handler context with a captured log + a finite action budget. */
function makeCtx(maxActions: number): { ctx: AutopilotContext; logs: AutopilotLogInput[]; actionsUsed: () => number } {
  const logs: AutopilotLogInput[] = [];
  let used = 0;
  const ctx: AutopilotContext = {
    orgId: ORG_ID,
    domain: "crm_calls",
    config: {} as AutopilotContext["config"],
    bot: { id: 1 } as AutopilotContext["bot"],
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
      status: "new",
      createdByUserId: OWNER_ID,
      assignedUserId: OWNER_ID,
      ...over,
    })
    .returning();
  return lead;
}

async function cleanup() {
  // crm_activities / lead_notes reference leads — clear children, then leads.
  await db.delete(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, ORG_ID)).catch(() => {});
  const leads = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable).where(eq(leadRecordsTable.orgId, ORG_ID));
  for (const l of leads) {
    await db.delete(leadNotesTable).where(eq(leadNotesTable.leadId, l.id)).catch(() => {});
  }
  await db.delete(leadRecordsTable).where(eq(leadRecordsTable.orgId, ORG_ID)).catch(() => {});
  const convs = await db.select({ id: smsConversationsTable.id }).from(smsConversationsTable).where(eq(smsConversationsTable.userId, OWNER_ID));
  for (const c of convs) {
    await db.delete(smsMessagesTable).where(eq(smsMessagesTable.conversationId, c.id)).catch(() => {});
  }
  await db.delete(smsConversationsTable).where(eq(smsConversationsTable.userId, OWNER_ID)).catch(() => {});
}

beforeAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  entitled = true;
  vi.clearAllMocks();
  // Each case starts from a clean slate so rows from a prior case (same ORG_ID)
  // never leak into another's assertions.
  await cleanup();
});
afterAll(async () => {
  await cleanup();
});

describe("CRM autopilot handler", () => {
  it("sends a real SMS for a due lead and records it to BOTH the CRM timeline and the autopilot log", async () => {
    const lead = await seedLead({ name: "Ada Lovelace", status: "new" });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    // Outreach went through the shared Twilio SMS service, never an auto-call.
    expect(twilioSpies.__spies.messagesCreate).toHaveBeenCalledTimes(1);
    expect(twilioSpies.__spies.callsCreate).not.toHaveBeenCalled();

    // CRM activity logged via the recorder (shared timeline + dedupe path).
    const activities = await db
      .select()
      .from(crmActivitiesTable)
      .where(and(eq(crmActivitiesTable.orgId, ORG_ID), eq(crmActivitiesTable.leadId, lead.id)));
    expect(activities.length).toBe(1);
    expect(activities[0].channel).toBe("sms");
    expect(activities[0].direction).toBe("outbound");

    // Lead side-effect (timeline note) fired exactly like a manual send.
    const notes = await db.select().from(leadNotesTable).where(eq(leadNotesTable.leadId, lead.id));
    expect(notes.length).toBe(1);
    expect(notes[0].note).toContain("Outbound SMS");

    // Autopilot activity log has a success touch + a tick summary.
    expect(logs.some((l) => l.action === "sms_followup" && l.outcome === "success")).toBe(true);
    expect(logs.some((l) => l.action === "tick")).toBe(true);
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

    // No new SMS sent for this just-contacted lead.
    expect(twilioSpies.__spies.messagesCreate).not.toHaveBeenCalled();
    expect(logs.some((l) => l.action === "sms_followup")).toBe(false);
    expect(logs.some((l) => l.action === "tick" && l.outcome === "noop")).toBe(true);
  });

  it("never auto-contacts closed leads", async () => {
    await seedLead({ name: "Closed Won", status: "closed_won" });
    await seedLead({ name: "Closed Lost", status: "closed_lost" });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    expect(logs.some((l) => l.action === "sms_followup")).toBe(false);
    const activities = await db.select().from(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, ORG_ID));
    expect(activities.length).toBe(0);
  });

  it("respects the per-tick action cap", async () => {
    await seedLead({ name: "L1", status: "new" });
    await seedLead({ name: "L2", status: "new" });
    await seedLead({ name: "L3", status: "new" });
    const { ctx, logs } = makeCtx(2);

    await crmCallsAutopilotHandler(ctx);

    const sent = logs.filter((l) => l.action === "sms_followup" && l.outcome === "success").length;
    expect(sent).toBe(2);
  });

  it("records intended actions WITHOUT sending when the org lacks the entitlement", async () => {
    entitled = false;
    const lead = await seedLead({ name: "No Plan", status: "new" });
    const { ctx, logs } = makeCtx(5);

    await crmCallsAutopilotHandler(ctx);

    // Nothing actually sent and nothing written to the CRM timeline.
    const activities = await db.select().from(crmActivitiesTable).where(eq(crmActivitiesTable.orgId, ORG_ID));
    expect(activities.length).toBe(0);
    const notes = await db.select().from(leadNotesTable).where(eq(leadNotesTable.leadId, lead.id));
    expect(notes.length).toBe(0);

    // But the intended action is recorded to the autopilot log (blocked, not error).
    expect(logs.some((l) => l.action === "intended_sms" && l.outcome === "blocked")).toBe(true);
  });
});
