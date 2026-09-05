import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const TICKET_CATEGORIES = ["bug", "support", "feature_request", "billing", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 300 }).notNull(),
  category: varchar("category", { length: 40 }).notNull().default("support"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  description: text("description").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  assignedToUserId: varchar("assigned_to_user_id"),
  submittedByEmail: varchar("submitted_by_email", { length: 320 }),
  submittedByName: varchar("submitted_by_name", { length: 200 }),
  submittedByUserId: varchar("submitted_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("tickets_org_id_idx").on(t.orgId),
  index("tickets_status_idx").on(t.status),
  index("tickets_assigned_to_idx").on(t.assignedToUserId),
]);

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;

export const ticketCommentsTable = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => ticketsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ticket_comments_ticket_id_idx").on(t.ticketId),
  index("ticket_comments_user_id_idx").on(t.userId),
]);

export const insertTicketCommentSchema = createInsertSchema(ticketCommentsTable).omit({ id: true, createdAt: true });
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketCommentsTable.$inferSelect;

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 80 }).notNull().default("info"),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body").notNull().default(""),
  link: varchar("link", { length: 500 }),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_read_idx").on(t.read),
]);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
