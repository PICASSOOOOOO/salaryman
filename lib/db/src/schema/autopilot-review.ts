import { pgTable, serial, integer, varchar, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AUTOPILOT_REVIEW_STATUSES = ["pending", "approved", "dismissed"] as const;
export type AutopilotReviewStatus = (typeof AUTOPILOT_REVIEW_STATUSES)[number];

// Human-reviewed follow-up tasks proposed from completed CRM calls. This queue
// stores drafts only; approval is the sole path that creates a business task.
export const autopilotReviewItemsTable = pgTable("autopilot_review_items", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  ownerUserId: varchar("owner_user_id", { length: 256 }).notNull(),
  sourceCallId: integer("source_call_id").notNull(),
  sourceLeadId: integer("source_lead_id"),
  sourceLeadName: varchar("source_lead_name", { length: 256 }).notNull().default(""),
  sourceCallAt: timestamp("source_call_at", { withTimezone: true }).notNull(),
  sourceSummary: text("source_summary").notNull(),
  taskTitle: varchar("task_title", { length: 300 }).notNull(),
  taskDescription: text("task_description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  businessTaskId: integer("business_task_id"),
  createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
  decidedByUserId: varchar("decided_by_user_id", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("autopilot_review_org_call_unique").on(table.orgId, table.sourceCallId),
  index("autopilot_review_org_status_created_idx").on(table.orgId, table.status, table.createdAt),
]);

export const insertAutopilotReviewItemSchema = createInsertSchema(autopilotReviewItemsTable).omit({
  id: true,
  createdAt: true,
  decidedAt: true,
});
export type InsertAutopilotReviewItem = z.infer<typeof insertAutopilotReviewItemSchema>;
export type AutopilotReviewItem = typeof autopilotReviewItemsTable.$inferSelect;
