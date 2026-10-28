import { pgTable, varchar, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";

export const USAGE_KINDS = [
  "voice_minutes", "ai_messages", "sms_count",
  "prep_interview", "prep_meeting", "prep_pitch", "prep_presentation",
  "prep_management", "prep_hiring", "prep_firing", "prep_difficult_conversation",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const usageMetersTable = pgTable(
  "usage_meters",
  {
    userId: varchar("user_id").notNull(),
    periodYearMonth: varchar("period_year_month", { length: 7 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.periodYearMonth, t.kind] })]
);

export type UsageMeter = typeof usageMetersTable.$inferSelect;

// `null` means reporting-only: track the count, but never block the action.
// Prep scenarios are uncapped; request-size and concurrency controls protect
// infrastructure independently of per-user usage reporting.
export const USAGE_LIMITS: Record<UsageKind, number | null> = {
  voice_minutes: 3000,
  ai_messages: 50000,
  sms_count: 250,
  prep_interview: null,
  prep_meeting: null,
  prep_pitch: null,
  prep_presentation: null,
  prep_management: null,
  prep_hiring: null,
  prep_firing: null,
  prep_difficult_conversation: null,
};
