// ── CRM & Calls autopilot handler ────────────────────────────────────────────
// Works an org's lead pipeline automatically when the CRM & Calls domain is ON.
// Each due tick it selects leads needing follow-up and sends real SMS follow-ups
// through the SHARED telephony service (the same `sendSmsMessage` the manual
// screen calls), so every automated touch flows through recordTelephonyActivity
// and lands in the org CRM timeline with the identical dedupe + lead side-effects
// as a human-sent message. Turning the domain OFF returns CRM to manual-only with
// zero data divergence.
//
// Calls: the existing manual person-to-person call flow (`/twilio/call`) dials a
// Twilio CONFERENCE that a human agent joins from the browser — there is no
// unattended equivalent, so the bot does NOT auto-place those calls. Automated
// outreach is SMS, which is fully self-driving. Inbound/IVR is out of scope.
import { db, leadRecordsTable, crmActivitiesTable } from "@workspace/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import type { AutopilotContext, AutopilotHandler } from "./types";
import { checkEntitlement } from "./guardrails";
import { sendSmsMessage } from "../telephony-service";

// Leads still in play. Closed (won/lost) leads are never auto-contacted.
const ACTIVE_LEAD_STATUSES = ["new", "contacted", "qualified", "proposal"] as const;

// Per-lead cooldown: a lead is "due" only when its most recent OUTBOUND CRM touch
// (call or SMS, manual or automated) is older than this. This is the per-lead cap
// that stops the bot over-contacting — it cannot text a lead twice within a day.
const FOLLOWUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Telephony's manual paths gate on the `phone_system` plan feature (bundled by
// PABLO / claw_bot). Autopilot mirrors that exact gate.
const TELEPHONY_FEATURE = "phone_system" as const;

/** Compose a short, friendly follow-up appropriate to where the lead sits in the pipeline. */
function buildFollowUpMessage(lead: typeof leadRecordsTable.$inferSelect): string {
  const name = lead.name && lead.name.trim() && lead.name !== lead.phone ? lead.name.trim().split(/\s+/)[0] : "there";
  switch (lead.status) {
    case "new":
      return `Hi ${name}, thanks for your interest! Is now a good time to chat about how we can help? Reply anytime.`;
    case "qualified":
      return `Hi ${name}, following up on our conversation — happy to answer any questions and find a time that works for you.`;
    case "proposal":
      return `Hi ${name}, just checking in on the proposal we sent over. Any questions I can help with?`;
    case "contacted":
    default:
      return `Hi ${name}, circling back to see if you'd like to take the next step. Let me know how I can help!`;
  }
}

/** Most recent outbound CRM touch (ms epoch) for a lead, or 0 if never contacted. */
async function lastOutboundTouchMs(orgId: number, leadId: number): Promise<number> {
  const [row] = await db
    .select({ occurredAt: crmActivitiesTable.occurredAt })
    .from(crmActivitiesTable)
    .where(
      and(
        eq(crmActivitiesTable.orgId, orgId),
        eq(crmActivitiesTable.leadId, leadId),
        eq(crmActivitiesTable.direction, "outbound"),
      ),
    )
    .orderBy(desc(crmActivitiesTable.occurredAt))
    .limit(1);
  return row?.occurredAt ? new Date(row.occurredAt).getTime() : 0;
}

export const crmCallsAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  // Mirror the manual telephony gate. We DON'T hard-fail when missing — per the
  // spec the bot still records the INTENDED follow-up so the org sees what it
  // would have done, it just doesn't actually send.
  const entitled = await checkEntitlement(ctx.ownerId, ctx.ownerEmail, TELEPHONY_FEATURE);

  // Candidate leads: in-play status, with a phone, due for follow-up. Read-only.
  const candidates = await db
    .select()
    .from(leadRecordsTable)
    .where(
      and(
        eq(leadRecordsTable.orgId, ctx.orgId),
        inArray(leadRecordsTable.status, [...ACTIVE_LEAD_STATUSES]),
      ),
    );

  const now = Date.now();
  const due: { lead: typeof leadRecordsTable.$inferSelect; lastTouchMs: number }[] = [];
  for (const lead of candidates) {
    if (!lead.phone || !lead.phone.trim()) continue;
    const lastTouchMs = await lastOutboundTouchMs(ctx.orgId, lead.id);
    if (now - lastTouchMs < FOLLOWUP_INTERVAL_MS) continue;
    due.push({ lead, lastTouchMs });
  }
  // Most overdue first so a small per-tick cap always serves the stalest leads.
  due.sort((a, b) => a.lastTouchMs - b.lastTouchMs);

  if (due.length === 0) {
    await ctx.log({
      action: "tick",
      summary: "CRM autopilot ran — no leads due for follow-up.",
      outcome: "noop",
      detail: { candidates: candidates.length, due: 0 },
    });
    return;
  }

  let sent = 0;
  let intended = 0;
  let failed = 0;

  for (const { lead } of due) {
    // Per-tick action cap. One claim == one lead worked this tick (per-lead cap
    // within a tick is implicitly 1). Stops cleanly when the budget is spent.
    if (!ctx.claimAction()) break;

    const body = buildFollowUpMessage(lead);
    const who = lead.name && lead.name !== lead.phone ? lead.name : lead.phone;

    if (!entitled) {
      // Mirror manual gating: record the intended action WITHOUT sending.
      intended++;
      await ctx.log({
        action: "intended_sms",
        summary: `Would send an SMS follow-up to ${who}, but the org lacks the phone-system entitlement — not sent.`,
        outcome: "blocked",
        detail: { leadId: lead.id, phone: lead.phone, channel: "sms", entitlement: TELEPHONY_FEATURE, body },
      });
      continue;
    }

    try {
      const result = await sendSmsMessage({
        userId: ctx.ownerId,
        orgId: ctx.orgId,
        phone: lead.phone,
        body,
        contactName: lead.name,
      });
      sent++;
      await ctx.log({
        action: "sms_followup",
        summary: `Sent an SMS follow-up to ${who}.`,
        outcome: "success",
        detail: {
          leadId: lead.id,
          phone: result.toPhone,
          channel: "sms",
          status: lead.status,
          twilioSid: result.message.twilioMessageSid,
        },
      });
    } catch (err) {
      failed++;
      await ctx.log({
        action: "sms_followup",
        summary: `Failed to send an SMS follow-up to ${who}: ${err instanceof Error ? err.message : "unknown error"}.`,
        outcome: "error",
        detail: { leadId: lead.id, phone: lead.phone, channel: "sms" },
      });
    }
  }

  await ctx.log({
    action: "tick",
    summary: entitled
      ? `CRM autopilot worked the lead list — ${sent} SMS follow-up(s) sent${failed ? `, ${failed} failed` : ""} (${due.length} due).`
      : `CRM autopilot found ${due.length} lead(s) due but the org lacks the phone-system entitlement — recorded ${intended} intended follow-up(s) without sending.`,
    outcome: sent > 0 || intended > 0 ? "success" : failed > 0 ? "error" : "noop",
    detail: { candidates: candidates.length, due: due.length, sent, intended, failed, entitled },
  });
};
