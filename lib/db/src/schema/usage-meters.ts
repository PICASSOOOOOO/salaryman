import { pgTable, varchar, integer, primaryKey, timestamp } from "drizzle-orm/pg-core";

export const USAGE_KINDS = ["voice_minutes", "ai_messages", "sms_count"] as const;
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

export const USAGE_LIMITS: Record<UsageKind, number> = {
  voice_minutes: 3000,
  ai_messages: 50000,
  sms_count: 250,
};
