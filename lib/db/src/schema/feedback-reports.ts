import { pgTable, serial, varchar, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackReportsTable = pgTable("feedback_reports", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  kind: varchar("kind", { length: 16 }).notNull().default("feedback"),
  category: varchar("category", { length: 50 }).notNull().default("Bug"),
  screenshotUrl: text("screenshot_url"),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  appVersion: varchar("app_version", { length: 50 }),
  // Stable fingerprint of an error_report (sha256 of normalized message +
  // top-of-stack). Lets the ingest path dedupe identical errors instead of
  // creating a fresh row per occurrence, and lets the sweeper auto-resolve
  // signatures that haven't recurred since a newer app_version shipped.
  // Nullable for legacy rows + non-error feedback.
  signature: varchar("signature", { length: 64 }),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionReason: varchar("resolution_reason", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("feedback_reports_user_id_idx").on(table.userId),
  index("feedback_reports_status_idx").on(table.status),
  index("feedback_reports_category_idx").on(table.category),
  index("feedback_reports_kind_idx").on(table.kind),
  index("feedback_reports_signature_idx").on(table.signature),
  index("feedback_reports_last_seen_idx").on(table.lastSeenAt),
  // Partial UNIQUE index: at most one OPEN error_report per signature.
  // This is what makes the ingest UPSERT race-safe — two simultaneous
  // reports for a brand-new error can't both insert; one wins, the other
  // hits the conflict and bumps occurrence_count via ON CONFLICT DO UPDATE.
  uniqueIndex("feedback_reports_open_signature_uniq")
    .on(table.signature)
    .where(sql`status = 'open' AND kind = 'error_report' AND signature IS NOT NULL`),
]);

export const insertFeedbackReportSchema = createInsertSchema(feedbackReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeedbackReport = z.infer<typeof insertFeedbackReportSchema>;
export type FeedbackReport = typeof feedbackReportsTable.$inferSelect;
