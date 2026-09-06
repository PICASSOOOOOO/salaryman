// ── CRM Telephony Recorder ──────────────────────────────────────────────────
// Records EVERY phone call, voicemail and SMS into the org-scoped CRM so the
// whole organization shares one timeline. The recorder:
//   1. resolves the handling user's active organization (CRM is an org feature —
//      users with no org are skipped, their data still lives in the user-scoped
//      call_history / sms tables),
//   2. snapshots the org industry for per-industry segmentation,
//   3. finds or creates the matching org lead (by phone, last-10-digit match),
//   4. upserts a crm_activities row (deduped by org + twilioSid + channel so
//      Twilio's repeated status / recording / transcription callbacks enrich a
//      single activity instead of duplicating it),
//   5. bumps the lead's call stats for voice channels.
// Every function is defensive: telephony webhooks must never 500 because of CRM
// bookkeeping, so all failures are swallowed and logged.
import {
  db,
  crmActivitiesTable,
  leadRecordsTable,
  leadNotesTable,
  orgMembersTable,
  organizationsTable,
  type CrmActivityChannel,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

function phoneMatches(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na.endsWith(nb.slice(-10)) || nb.endsWith(na.slice(-10));
}

function toE164(phone: string): string {
  const n = normalizePhone(phone);
  if (!n) return phone || "";
  if (n.length === 10) return `+1${n}`;
  if (n.length === 11 && n.startsWith("1")) return `+${n}`;
  return `+${n}`;
}

export async function resolveOrgForUser(
  userId: string,
): Promise<{ orgId: number; industry: string | null } | null> {
  try {
    const rows = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
      .limit(1);
    if (!rows[0]) return null;
    const orgId = rows[0].orgId;
    const orgRows = await db
      .select({ industry: organizationsTable.industry })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    return { orgId, industry: orgRows[0]?.industry ?? null };
  } catch (e: unknown) {
    console.error("[CRM] resolveOrgForUser error:", e instanceof Error ? e.message : "Unknown");
    return null;
  }
}

async function findOrCreateOrgLead(opts: {
  orgId: number;
  userId: string;
  phone: string;
  name?: string | null;
  source: string;
}): Promise<number | null> {
  const { orgId, userId, phone, name, source } = opts;
  if (!phone) return null;
  try {
    const leads = await db
      .select()
      .from(leadRecordsTable)
      .where(eq(leadRecordsTable.orgId, orgId));
    const existing = leads.find((l) => l.phone && phoneMatches(l.phone, phone));
    if (existing) {
      // Backfill a real name if we previously only had the raw number.
      if (name && (!existing.name || existing.name === existing.phone || normalizePhone(existing.name) === normalizePhone(existing.phone))) {
        await db
          .update(leadRecordsTable)
          .set({ name: name.slice(0, 256) })
          .where(eq(leadRecordsTable.id, existing.id))
          .catch(() => {});
      }
      return existing.id;
    }
    const [created] = await db
      .insert(leadRecordsTable)
      .values({
        orgId,
        createdByUserId: userId,
        assignedUserId: userId,
        name: (name || toE164(phone)).slice(0, 256),
        phone: toE164(phone),
        source,
        status: "new",
      })
      .returning();
    return created?.id ?? null;
  } catch (e: unknown) {
    console.error("[CRM] findOrCreateOrgLead error:", e instanceof Error ? e.message : "Unknown");
    return null;
  }
}

export interface RecordTelephonyOpts {
  userId: string;
  /** Pass when already known (e.g. from call_history.orgId) to skip a lookup. */
  orgId?: number | null;
  channel: Exclude<CrmActivityChannel, "comms">;
  direction?: "inbound" | "outbound";
  /** The OTHER party's number (the contact), not the org's Twilio line. */
  phone: string;
  contactName?: string | null;
  contactId?: number | null;
  body?: string | null;
  summary?: string | null;
  recordingUrl?: string | null;
  durationSeconds?: number | null;
  status?: string | null;
  twilioSid?: string | null;
}

/**
 * Record (or enrich) a single telephony interaction in the org CRM. Safe to call
 * repeatedly with the same twilioSid — later calls enrich the existing row.
 * Returns the crm_activities id, or null when there's nothing to record (no org,
 * no phone, etc.).
 */
export async function recordTelephonyActivity(opts: RecordTelephonyOpts): Promise<number | null> {
  try {
    const phone = (opts.phone || "").trim();
    if (!opts.userId || !phone) return null;

    let orgId = opts.orgId ?? null;
    let industry: string | null = null;
    if (orgId) {
      const orgRows = await db
        .select({ industry: organizationsTable.industry })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1);
      industry = orgRows[0]?.industry ?? null;
    } else {
      const resolved = await resolveOrgForUser(opts.userId);
      if (!resolved) return null;
      orgId = resolved.orgId;
      industry = resolved.industry;
    }

    const direction = opts.direction ?? "outbound";
    const sourceMap: Record<Exclude<CrmActivityChannel, "comms">, string> = {
      call: direction === "inbound" ? "inbound_call" : "outbound_call",
      voicemail: "voicemail",
      sms: direction === "inbound" ? "inbound_sms" : "outbound_sms",
    };

    const leadId = await findOrCreateOrgLead({
      orgId,
      userId: opts.userId,
      phone,
      name: opts.contactName,
      source: sourceMap[opts.channel],
    });

    const setFields = {
      orgId,
      userId: opts.userId,
      leadId: leadId ?? undefined,
      contactId: opts.contactId ?? undefined,
      channel: opts.channel,
      direction,
      phone: toE164(phone),
      contactName: opts.contactName ?? undefined,
      body: opts.body ?? undefined,
      summary: opts.summary ?? undefined,
      recordingUrl: opts.recordingUrl ?? undefined,
      durationSeconds: opts.durationSeconds ?? undefined,
      status: opts.status ?? undefined,
      industry: industry ?? undefined,
      twilioSid: opts.twilioSid ?? undefined,
    };

    // Dedupe on (org, twilioSid, channel): Twilio fires status/recording/
    // transcription callbacks for one call, each enriching the same activity.
    let activityId: number | null = null;
    if (opts.twilioSid) {
      const existing = await db
        .select({ id: crmActivitiesTable.id })
        .from(crmActivitiesTable)
        .where(
          and(
            eq(crmActivitiesTable.orgId, orgId),
            eq(crmActivitiesTable.twilioSid, opts.twilioSid),
            eq(crmActivitiesTable.channel, opts.channel),
          ),
        )
        .limit(1);
      if (existing[0]) {
        // Only overwrite columns we actually have new values for.
        const updateSet: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(setFields)) {
          if (v !== undefined && v !== null && v !== "") updateSet[k] = v;
        }
        if (Object.keys(updateSet).length > 0) {
          await db.update(crmActivitiesTable).set(updateSet).where(eq(crmActivitiesTable.id, existing[0].id));
        }
        activityId = existing[0].id;
      }
    }

    // True only when this call inserted a brand-new activity (vs enriching an
    // existing one via a later Twilio retry/callback). Side effects below must
    // run ONCE per interaction, not on every webhook for the same twilioSid.
    let isNewActivity = activityId === null;
    if (activityId === null) {
      try {
        const [created] = await db.insert(crmActivitiesTable).values(setFields).returning({ id: crmActivitiesTable.id });
        activityId = created?.id ?? null;
      } catch (insertErr: unknown) {
        // Lost the race against a concurrent webhook for the same twilioSid: the
        // partial unique index rejected this insert. Re-resolve and enrich the
        // winner instead of dropping the data — and DON'T double-write side effects.
        if (opts.twilioSid) {
          const winner = await db
            .select({ id: crmActivitiesTable.id })
            .from(crmActivitiesTable)
            .where(
              and(
                eq(crmActivitiesTable.orgId, orgId),
                eq(crmActivitiesTable.twilioSid, opts.twilioSid),
                eq(crmActivitiesTable.channel, opts.channel),
              ),
            )
            .limit(1);
          if (winner[0]) {
            const updateSet: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(setFields)) {
              if (v !== undefined && v !== null && v !== "") updateSet[k] = v;
            }
            if (Object.keys(updateSet).length > 0) {
              await db.update(crmActivitiesTable).set(updateSet).where(eq(crmActivitiesTable.id, winner[0].id));
            }
            activityId = winner[0].id;
            isNewActivity = false;
          } else {
            throw insertErr;
          }
        } else {
          throw insertErr;
        }
      }
    }

    // Mirror a human-readable line into the lead timeline (lead_notes) and bump
    // call stats for voice channels so the existing CRM surfaces stay accurate.
    // Only on first record of the interaction to avoid duplicate notes / inflated
    // callCount from Twilio's status/recording/transcription retries.
    if (leadId && isNewActivity) {
      try {
        const verb =
          opts.channel === "sms"
            ? direction === "inbound" ? "Inbound SMS" : "Outbound SMS"
            : opts.channel === "voicemail"
              ? "Voicemail"
              : direction === "inbound" ? "Inbound call" : "Outbound call";
        const detail = (opts.summary || opts.body || opts.status || "").toString().slice(0, 1000);
        const dur = opts.durationSeconds ? ` (${opts.durationSeconds}s)` : "";
        await db.insert(leadNotesTable).values({
          leadId,
          userId: opts.userId,
          note: `[${verb}${dur}] ${detail}`.trim(),
        });
        if (opts.channel !== "sms") {
          const leadRows = await db
            .select({ callCount: leadRecordsTable.callCount })
            .from(leadRecordsTable)
            .where(eq(leadRecordsTable.id, leadId))
            .limit(1);
          await db
            .update(leadRecordsTable)
            .set({ callCount: (leadRows[0]?.callCount ?? 0) + 1, lastCalledAt: new Date() })
            .where(eq(leadRecordsTable.id, leadId));
        }
      } catch (e: unknown) {
        console.error("[CRM] lead timeline write error:", e instanceof Error ? e.message : "Unknown");
      }
    }

    return activityId;
  } catch (e: unknown) {
    console.error("[CRM] recordTelephonyActivity error:", e instanceof Error ? e.message : "Unknown");
    return null;
  }
}

/** Add an internal COMMS handoff to the same lead timeline as telephony. */
export async function recordCommsActivity(opts: {
  userId: string;
  orgId: number;
  leadId: number;
  body: string;
  summary?: string;
  status?: string;
}): Promise<number | null> {
  try {
    const [created] = await db
      .insert(crmActivitiesTable)
      .values({
        orgId: opts.orgId,
        userId: opts.userId,
        leadId: opts.leadId,
        channel: "comms",
        direction: "outbound",
        body: opts.body,
        summary: opts.summary || "Internal COMMS handoff",
        status: opts.status || "sent",
      })
      .returning({ id: crmActivitiesTable.id });
    await db.insert(leadNotesTable).values({
      leadId: opts.leadId,
      userId: opts.userId,
      note: `[COMMS handoff] ${(opts.summary || opts.body).slice(0, 1000)}`,
    });
    return created?.id ?? null;
  } catch (e: unknown) {
    console.error("[CRM] recordCommsActivity error:", e instanceof Error ? e.message : "Unknown");
    return null;
  }
}

export { normalizePhone, phoneMatches, toE164 as toE164Phone };
