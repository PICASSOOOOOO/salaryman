// ── CRM & Calls autopilot handler ────────────────────────────────────────────
// Works an org's lead pipeline automatically when the CRM & Calls domain is ON.
// Each due tick it selects leads needing follow-up and sends email through the
// existing Resend integration. Turning the domain OFF returns CRM to manual-only.
//
// Calls: the existing manual person-to-person call flow (`/twilio/call`) dials a
// Twilio CONFERENCE that a human agent joins from the browser — there is no
// unattended equivalent, so the bot does NOT auto-place those calls. Automated
// outreach uses email and does not depend on Twilio SMS verification.
import {
  db,
  autopilotActivityLogTable,
  contactChannelPrefsTable,
  contactsTable,
  leadRecordsTable,
  crmActivitiesTable,
} from "@workspace/db";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import type { AutopilotContext, AutopilotHandler } from "./types";
import { readCrmPrefs, resolveCrmLeadStatuses } from "./crm-prefs";
import { getUncachableResendClient } from "../resend";
import { recordEmailActivity } from "../crm-recorder";
import { buildEmailOptOutUrl } from "../email-opt-out";

/** Compose a short, friendly email appropriate to the lead's pipeline stage. */
function buildFollowUpEmail(lead: typeof leadRecordsTable.$inferSelect): { subject: string; text: string } {
  const name = lead.name && lead.name.trim() && lead.name !== lead.phone ? lead.name.trim().split(/\s+/)[0] : "there";
  let message: string;
  switch (lead.status) {
    case "new":
      message = "Thanks for your interest. Is now a good time to chat about how we can help?";
      break;
    case "qualified":
      message = "I’m following up on our conversation. I’m happy to answer questions and find a time that works for you.";
      break;
    case "proposal":
      message = "I’m checking in on the proposal we sent. Do you have any questions I can help with?";
      break;
    case "contacted":
    default:
      message = "I’m following up to see whether you’d like to take the next step. Let me know how I can help.";
  }
  return {
    subject: lead.status === "proposal" ? "Following up on your proposal" : "A quick follow-up",
    text: `Hi ${name},\n\n${message}\n\nBest,\nYour team`,
  };
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

async function lastFailedFollowUpMs(orgId: number, leadId: number): Promise<number> {
  const [row] = await db
    .select({ createdAt: autopilotActivityLogTable.createdAt })
    .from(autopilotActivityLogTable)
    .where(and(
      eq(autopilotActivityLogTable.orgId, orgId),
      eq(autopilotActivityLogTable.domain, "crm_calls"),
      eq(autopilotActivityLogTable.action, "email_followup"),
      eq(autopilotActivityLogTable.outcome, "error"),
      sql`${autopilotActivityLogTable.detail}->>'leadId' = ${String(leadId)}`,
    ))
    .orderBy(desc(autopilotActivityLogTable.createdAt))
    .limit(1);
  return row?.createdAt ? new Date(row.createdAt).getTime() : 0;
}

function normalizedEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function getEmailOptedOutAddresses(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({
      contactId: contactsTable.id,
      email: contactsTable.email,
      emailOptIn: contactChannelPrefsTable.emailOptIn,
      emailOptedOutAt: contactChannelPrefsTable.emailOptedOutAt,
    })
    .from(contactsTable)
    .innerJoin(contactChannelPrefsTable, and(
      eq(contactChannelPrefsTable.contactId, contactsTable.id),
      eq(contactChannelPrefsTable.userId, userId),
    ))
    .where(eq(contactsTable.userId, userId))
    .orderBy(desc(contactChannelPrefsTable.updatedAt), desc(contactChannelPrefsTable.id));
  const latestByContact = new Map<number, { email: string; emailOptIn: boolean; emailOptedOutAt: Date | null }>();
  for (const row of rows) {
    if (!latestByContact.has(row.contactId)) {
      latestByContact.set(row.contactId, {
        email: row.email,
        emailOptIn: row.emailOptIn,
        emailOptedOutAt: row.emailOptedOutAt,
      });
    }
  }
  return new Set(
    [...latestByContact.values()]
      .filter((row) => (!row.emailOptIn || row.emailOptedOutAt) && row.email.trim())
      .map((row) => normalizedEmailKey(row.email)),
  );
}

async function isEmailOptedOut(userId: string, email: string): Promise<boolean> {
  const [preference] = await db
    .select({
      emailOptIn: contactChannelPrefsTable.emailOptIn,
      emailOptedOutAt: contactChannelPrefsTable.emailOptedOutAt,
    })
    .from(contactsTable)
    .innerJoin(contactChannelPrefsTable, and(
      eq(contactChannelPrefsTable.contactId, contactsTable.id),
      eq(contactChannelPrefsTable.userId, userId),
    ))
    .where(and(
      eq(contactsTable.userId, userId),
      sql`lower(trim(${contactsTable.email})) = ${normalizedEmailKey(email)}`,
    ))
    .orderBy(desc(contactChannelPrefsTable.updatedAt), desc(contactChannelPrefsTable.id))
    .limit(1);
  return Boolean(preference && (!preference.emailOptIn || preference.emailOptedOutAt));
}

export const crmCallsAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  // Owner-tunable preferences (which stages to work, cooldown, per-tick cap). An
  // org that never set any gets all in-play stages on a 24h cooldown, as before.
  const prefs = readCrmPrefs(ctx.config.prefs);
  const statuses = resolveCrmLeadStatuses(prefs.leadStatuses);
  const followUpIntervalMs = prefs.followUpIntervalHours * 60 * 60 * 1000;
  const perTickCap = prefs.maxFollowUpsPerTick > 0 ? prefs.maxFollowUpsPerTick : Infinity;

  // Candidate leads: in-play status, with an email address, due for follow-up.
  const candidates = await db
    .select()
    .from(leadRecordsTable)
    .where(
      and(
        eq(leadRecordsTable.orgId, ctx.orgId),
        inArray(leadRecordsTable.status, statuses),
      ),
    );

  const now = Date.now();
  const optedOutEmailAddresses = await getEmailOptedOutAddresses(ctx.ownerId);
  let optedOut = 0;
  const due: { lead: typeof leadRecordsTable.$inferSelect; lastTouchMs: number }[] = [];
  for (const lead of candidates) {
    if (!isValidEmail(lead.email)) continue;
    if (optedOutEmailAddresses.has(normalizedEmailKey(lead.email))) {
      optedOut++;
      continue;
    }
    const lastOutboundMs = await lastOutboundTouchMs(ctx.orgId, lead.id);
    if (now - lastOutboundMs < followUpIntervalMs) continue;
    const lastTouchMs = Math.max(lastOutboundMs, await lastFailedFollowUpMs(ctx.orgId, lead.id));
    if (now - lastTouchMs < followUpIntervalMs) continue;
    due.push({ lead, lastTouchMs });
  }
  // Most overdue first so a small per-tick cap always serves the stalest leads.
  due.sort((a, b) => a.lastTouchMs - b.lastTouchMs);

  if (due.length === 0) {
    await ctx.log({
      action: "tick",
      summary: optedOut
        ? `CRM autopilot ran — no leads due for follow-up; ${optedOut} email-opted-out lead(s) suppressed.`
        : "CRM autopilot ran — no leads due for follow-up.",
      outcome: "noop",
      detail: { candidates: candidates.length, due: 0, emailOptedOut: optedOut },
    });
    return;
  }

  let sent = 0;
  let failed = 0;
  let senderPromise: ReturnType<typeof getUncachableResendClient> | undefined;

  for (const { lead } of due) {
    // Owner-set per-tick lead cap (0 = unlimited). Stops once it's reached so a
    // big due list never floods leads in a single tick beyond what the owner set.
    if (sent + failed >= perTickCap) break;
    // Per-tick action cap. One claim == one lead worked this tick (per-lead cap
    // within a tick is implicitly 1). Stops cleanly when the budget is spent.
    if (!ctx.claimAction()) break;

    const email = lead.email.trim();
    const who = lead.name?.trim() || email;
    const { subject, text } = buildFollowUpEmail(lead);

    try {
      if (await isEmailOptedOut(ctx.ownerId, email)) {
        optedOut++;
        continue;
      }
      senderPromise ??= getUncachableResendClient();
      const { client, fromEmail } = await senderPromise;
      const unsubscribeUrl = buildEmailOptOutUrl(ctx.ownerId, email);
      const fullText = `${text}\n\nTo stop these follow-up emails, unsubscribe here: ${unsubscribeUrl}`;
      const result = await client.emails.send({
        from: fromEmail,
        to: email,
        subject,
        text: fullText,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#191919"><p>${htmlEscape(text).replace(/\n/g, "<br>")}</p><p style="font-size:12px;color:#666"><a href="${htmlEscape(unsubscribeUrl)}">Unsubscribe from follow-up emails</a></p></div>`,
      });
      const activitySummary = `Email follow-up sent to ${email}`;
      if ((result as { error?: { message?: string } } | null)?.error) {
        throw new Error((result as { error: { message?: string } }).error.message || "Email provider rejected the message");
      }
      await recordEmailActivity({
        userId: ctx.ownerId,
        orgId: ctx.orgId,
        leadId: lead.id,
        email,
        contactName: lead.name,
        body: fullText,
        summary: activitySummary,
        status: "sent",
      });
      sent++;
      await ctx.log({
        action: "email_followup",
        summary: `Sent an email follow-up to ${who}.`,
        outcome: "success",
        detail: {
          leadId: lead.id,
          channel: "email",
          status: lead.status,
        },
      });
    } catch (err) {
      failed++;
      await ctx.log({
        action: "email_followup",
        summary: `Failed to send an email follow-up to ${who}: ${err instanceof Error ? err.message : "unknown error"}.`,
        outcome: "error",
        detail: { leadId: lead.id, channel: "email" },
      });
    }
  }

  await ctx.log({
    action: "tick",
    summary: `CRM autopilot worked the lead list — ${sent} email follow-up(s) sent${failed ? `, ${failed} failed` : ""} (${due.length} due${optedOut ? `, ${optedOut} email-opted-out` : ""}).`,
    outcome: sent > 0 ? "success" : failed > 0 ? "error" : "noop",
    detail: { candidates: candidates.length, due: due.length, sent, failed, emailOptedOut: optedOut },
  });

};
