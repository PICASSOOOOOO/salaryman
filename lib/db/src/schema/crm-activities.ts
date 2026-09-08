import { pgTable, serial, varchar, integer, timestamp, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Unified, ORG-SCOPED record of every telephony interaction (phone calls,
// voicemails, SMS) so the whole organization shares one CRM timeline. Each row
// is attributed to the handling user (userId) and, when resolvable, linked to a
// CRM lead (leadId). `industry` snapshots the org's industry at record time so
// reporting can be adjusted/segmented per industry without a back-join.
//
// Plain integer org_id / lead_id (no hard FK) mirrors call_history/phone_numbers
// to avoid the circular import with organizations.ts.
export const CRM_ACTIVITY_CHANNELS = ["call", "voicemail", "sms", "comms"] as const;
export type CrmActivityChannel = (typeof CRM_ACTIVITY_CHANNELS)[number];

export const crmActivitiesTable = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  leadId: integer("lead_id"),
  contactId: integer("contact_id"),
  channel: varchar("channel", { length: 16 }).notNull(),
  direction: varchar("direction", { length: 16 }).notNull().default("outbound"),
  phone: varchar("phone", { length: 64 }).notNull().default(""),
  contactName: varchar("contact_name", { length: 256 }),
  body: text("body"),
  summary: text("summary"),
  recordingUrl: varchar("recording_url", { length: 512 }),
  durationSeconds: integer("duration_seconds").default(0),
  status: varchar("status", { length: 32 }),
  industry: varchar("industry", { length: 80 }),
  twilioSid: varchar("twilio_sid", { length: 64 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("crm_activities_org_id_idx").on(t.orgId),
  index("crm_activities_lead_id_idx").on(t.leadId),
  index("crm_activities_phone_idx").on(t.phone),
  index("crm_activities_channel_idx").on(t.channel),
  index("crm_activities_twilio_sid_idx").on(t.twilioSid),
  index("crm_activities_occurred_at_idx").on(t.occurredAt),
  // Race-safe dedupe: at most one activity per (org, twilioSid, channel). Partial
  // so rows without a Twilio SID (e.g. Mila auto-replies) are unconstrained.
  uniqueIndex("crm_activities_org_sid_channel_uq")
    .on(t.orgId, t.twilioSid, t.channel)
    .where(sql`${t.twilioSid} IS NOT NULL`),
]);

export type CrmActivity = typeof crmActivitiesTable.$inferSelect;
export type InsertCrmActivity = typeof crmActivitiesTable.$inferInsert;
