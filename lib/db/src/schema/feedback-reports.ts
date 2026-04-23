import { pgTable, serial, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("feedback_reports_user_id_idx").on(table.userId),
  index("feedback_reports_status_idx").on(table.status),
  index("feedback_reports_category_idx").on(table.category),
  index("feedback_reports_kind_idx").on(table.kind),
]);

export const insertFeedbackReportSchema = createInsertSchema(feedbackReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeedbackReport = z.infer<typeof insertFeedbackReportSchema>;
export type FeedbackReport = typeof feedbackReportsTable.$inferSelect;
