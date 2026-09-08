import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { feedbackReportsTable } from "./feedback-reports";

export const DEV_TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type DevTaskPriority = (typeof DEV_TASK_PRIORITIES)[number];

export const DEV_TASK_STATUSES = ["open", "in_progress", "resolved", "verified"] as const;
export type DevTaskStatus = (typeof DEV_TASK_STATUSES)[number];

export const devTasksTable = pgTable("dev_tasks", {
  id: serial("id").primaryKey(),
  feedbackReportId: integer("feedback_report_id").notNull().references(() => feedbackReportsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  assignedToUserId: varchar("assigned_to_user_id"),
  escalated: boolean("escalated").notNull().default(false),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dev_tasks_feedback_report_id_idx").on(t.feedbackReportId),
  index("dev_tasks_status_idx").on(t.status),
  index("dev_tasks_priority_idx").on(t.priority),
  index("dev_tasks_assigned_to_idx").on(t.assignedToUserId),
  index("dev_tasks_escalated_idx").on(t.escalated),
]);

export const insertDevTaskSchema = createInsertSchema(devTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDevTask = z.infer<typeof insertDevTaskSchema>;
export type DevTask = typeof devTasksTable.$inferSelect;

export const devTaskNotesTable = pgTable("dev_task_notes", {
  id: serial("id").primaryKey(),
  devTaskId: integer("dev_task_id").notNull().references(() => devTasksTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dev_task_notes_task_id_idx").on(t.devTaskId),
]);

export const insertDevTaskNoteSchema = createInsertSchema(devTaskNotesTable).omit({ id: true, createdAt: true });
export type InsertDevTaskNote = z.infer<typeof insertDevTaskNoteSchema>;
export type DevTaskNote = typeof devTaskNotesTable.$inferSelect;
