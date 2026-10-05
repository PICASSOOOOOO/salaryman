// ── CRM Telephony Recorder ──────────────────────────────────────────────────
// Records EVERY phone call, voicemail and SMS into the org-scoped CRM so the
// whole organization shares one timeline. The recorder:
//   1. resolves the handling user's active organization (CRM is an org feature —
//      users with no org are skipped, their data still lives in the user-scoped
//      call_history / sms tables),
//   2. snapshots the org industry for per-industry segmentation,
//   3. finds or creates the matching org lead (phone plus corroborating identity),
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
  return !!na && !!nb && na === nb;
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
  dateOfBirth?: string | null;
  email?: string | null;
  company?: string | null;
  source: string;
}): Promise<number | null> {
  const { orgId, userId, phone, name, dateOfBirth, email, company, source } = opts;
  if (!phone) return null;
  try {
    const leads = await db
      .select()
      .from(leadRecordsTable)
      .where(eq(leadRecordsTable.orgId, orgId));
    const phoneLeads = leads.filter((lead) => lead.phone && phoneMatches(lead.phone, phone));
    const normalizedName = normalizeLeadName(name);
    const isPlaceholder = (lead: typeof leads[number]) =>
      !lead.name || lead.name === lead.phone || normalizePhone(lead.name) === normalizePhone(lead.phone);
    const storedDob = (lead: typeof leads[number]) => {
      const value = lead.customFieldsJson?.dateOfBirth;
      return typeof value === "string" ? value : "";
    };

    let existing: typeof leads[number] | undefined;
    if (normalizedName) {
      const sameName = phoneLeads.filter((lead) => normalizeLeadName(lead.name) === normalizedName);
      const consistent = sameName.filter((lead) => !dateOfBirth || !storedDob(lead) || storedDob(lead) === dateOfBirth);
      if (consistent.length === 1) existing = consistent[0];
    } else if (dateOfBirth) {
      const sameDob = phoneLeads.filter((lead) => storedDob(lead) === dateOfBirth);
      if (sameDob.length === 1) existing = sameDob[0];
    } else {
      // A phone-only lead represents an unidentified number, not a person.
      // Never attach a named caller to it or merge two named people on a shared line.
      const placeholders = phoneLeads.filter(isPlaceholder);
      if (placeholders.length === 1) existing = placeholders[0];
    }

    if (existing) {
      const customFields = { ...(existing.customFieldsJson ?? {}) };
      if (dateOfBirth && !storedDob(existing)) customFields.dateOfBirth = dateOfBirth;
      const update: Record<string, unknown> = {};
      if (dateOfBirth && !storedDob(existing)) update.customFieldsJson = customFields;
      if (email && !existing.email) update.email = email.slice(0, 256);
      if (company && !existing.company) update.company = company.slice(0, 256);
      if (Object.keys(update).length) {
        await db.update(leadRecordsTable).set(update).where(eq(leadRecordsTable.id, existing.id));
      }
      return existing.id;
    }

    const customFields: Record<string, unknown> = {
      identityResolution: normalizedName || dateOfBirth ? "corroborated_call_evidence" : "phone_only_unidentified",
    };
    if (dateOfBirth) customFields.dateOfBirth = dateOfBirth;
    const [created] = await db
      .insert(leadRecordsTable)
      .values({
        orgId,
        createdByUserId: userId,
        assignedUserId: userId,
        name: (name || toE164(phone)).slice(0, 256),
        phone: toE164(phone),
        email: email?.slice(0, 256) ?? "",
        company: company?.slice(0, 256) ?? "",
        customFieldsJson: customFields,
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

function normalizeLeadName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
}

export interface CallerIdentityEvidence {
  name?: string;
  dateOfBirth?: string;
  email?: string;
  company?: string;
}

function normalizeExplicitDate(value: string): string | undefined {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)) {
      return `${year}-${month}-${day}`;
    }
    return undefined;
  }
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    // Skip ambiguous dates such as 03/04/1980 rather than choosing a locale.
    if (first <= 12 && second <= 12) return undefined;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /[A-Za-z]/.test(value)) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }
  return undefined;
}

/**
 * Pull conservative CRM evidence only from transcript turns already labelled Caller.
 * The DOB is internal matching data and is never included in public research queries.
 */
export function extractCallerIdentityEvidence(transcript: string): CallerIdentityEvidence {
  const callerLines = transcript
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:caller|contact|external)\s*:/i.test(line))
    .map((line) => line.replace(/^\s*(?:caller|contact|external)\s*:\s*/i, ""));
  const result: CallerIdentityEvidence = {};
  for (const line of callerLines) {
    if (!result.name) {
      const match = line.match(/\b(?:my name is|my name's|this is|i am|i'm)\s+([A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,3})/i);
      if (match) result.name = match[1].trim().replace(/[.,;:]+$/, "").slice(0, 128);
    }
    if (!result.dateOfBirth) {
      const match = line.match(/\b(?:my\s+)?(?:date of birth|dob)\s+is\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i)
        ?? line.match(/\bi was born(?: on)?\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i);
      if (match) result.dateOfBirth = normalizeExplicitDate(match[1]);
    }
    if (!result.email) {
      const match = line.match(/\b(?:my\s+)?email(?: address)?\s+is\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
      if (match) result.email = match[1].slice(0, 256);
    }
    if (!result.company) {
      const match = line.match(/\b(?:i work at|i work for|i'm with|i am with)\s+([^,.;!?]{2,100})/i);
      if (match) {
        result.company = match[1].split(/\s+(?:and|but|because)\s+/i)[0].trim().slice(0, 256);
      }
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => !!value)) as CallerIdentityEvidence;
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
  /** Explicit fields spoken by a Caller-labelled transcript turn. */
  dateOfBirth?: string | null;
  email?: string | null;
  company?: string | null;
  contactId?: number | null;
  /** Authoritative CRM lead selected by the caller. Must already be org-scoped by the caller. */
  leadId?: number | null;
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
      const membership = await db
        .select({ orgId: orgMembersTable.orgId })
        .from(orgMembersTable)
        .where(and(
          eq(orgMembersTable.userId, opts.userId),
          eq(orgMembersTable.orgId, orgId),
          eq(orgMembersTable.status, "active"),
        ))
        .limit(1);
      // Never trust a stale/foreign org hint from a callback or client.
      if (!membership[0] && opts.leadId) {
        const [ownedLead] = await db
          .select({ id: leadRecordsTable.id })
          .from(leadRecordsTable)
          .where(and(
            eq(leadRecordsTable.id, opts.leadId),
            eq(leadRecordsTable.orgId, orgId),
            eq(leadRecordsTable.assignedUserId, opts.userId),
          ))
          .limit(1);
        if (ownedLead) membership.push({ orgId });
      }
      if (!membership[0]) {
        const [ownedLead] = await db
          .select({ id: leadRecordsTable.id })
          .from(leadRecordsTable)
          .where(and(
            eq(leadRecordsTable.orgId, orgId),
            eq(leadRecordsTable.assignedUserId, opts.userId),
            eq(leadRecordsTable.phone, opts.phone),
          ))
          .limit(1);
        if (ownedLead) membership.push({ orgId });
      }
      if (!membership[0]) orgId = null;
    }
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

    const leadId = opts.leadId ?? await findOrCreateOrgLead({
      orgId,
      userId: opts.userId,
      phone,
      name: opts.contactName,
      dateOfBirth: opts.dateOfBirth,
      email: opts.email,
      company: opts.company,
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
