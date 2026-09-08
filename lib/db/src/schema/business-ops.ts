import { pgTable, serial, varchar, text, integer, timestamp, index, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  employeeId: integer("employee_id"),
  employeeName: varchar("employee_name", { length: 200 }).notNull().default(""),
  date: varchar("date", { length: 20 }).notNull(),
  clockIn: varchar("clock_in", { length: 10 }).notNull(),
  clockOut: varchar("clock_out", { length: 10 }),
  hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }).default("0"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).default("0"),
  project: varchar("project", { length: 200 }).notNull().default(""),
  description: text("description").notNull().default(""),
  billable: boolean("billable").notNull().default(true),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("time_entries_user_id_idx").on(t.userId),
  index("time_entries_date_idx").on(t.date),
  index("time_entries_employee_idx").on(t.employeeId),
]);

export const insertTimeEntrySchema = createInsertSchema(timeEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntriesTable.$inferSelect;

export const businessTasksTable = pgTable("business_tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull().default(""),
  status: varchar("status", { length: 30 }).notNull().default("todo"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  assignee: varchar("assignee", { length: 200 }).notNull().default(""),
  dueDate: varchar("due_date", { length: 20 }),
  project: varchar("project", { length: 200 }).notNull().default(""),
  tags: varchar("tags", { length: 500 }).notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("business_tasks_user_id_idx").on(t.userId),
  index("business_tasks_status_idx").on(t.status),
  index("business_tasks_assignee_idx").on(t.assignee),
  index("business_tasks_due_date_idx").on(t.dueDate),
]);

export const insertBusinessTaskSchema = createInsertSchema(businessTasksTable).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertBusinessTask = z.infer<typeof insertBusinessTaskSchema>;
export type BusinessTask = typeof businessTasksTable.$inferSelect;

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  authorName: varchar("author_name", { length: 200 }).notNull().default(""),
  title: varchar("title", { length: 300 }).notNull(),
  content: text("content").notNull().default(""),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("announcements_user_id_idx").on(t.userId),
  index("announcements_category_idx").on(t.category),
]);

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 300 }).notNull().default(""),
  estimateNumber: varchar("estimate_number", { length: 50 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  issueDate: varchar("issue_date", { length: 20 }).notNull(),
  expiryDate: varchar("expiry_date", { length: 20 }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  lineItems: text("line_items").notNull().default("[]"),
  convertedToInvoiceId: integer("converted_to_invoice_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("estimates_user_id_idx").on(t.userId),
  index("estimates_status_idx").on(t.status),
  index("estimates_client_idx").on(t.clientName),
]);

export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 200 }).notNull().default(""),
  email: varchar("email", { length: 300 }).notNull().default(""),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  address: text("address").notNull().default(""),
  category: varchar("category", { length: 80 }).notNull().default("general"),
  website: varchar("website", { length: 500 }).notNull().default(""),
  taxId: varchar("tax_id", { length: 50 }).notNull().default(""),
  paymentTerms: varchar("payment_terms", { length: 50 }).notNull().default("net-30"),
  notes: text("notes").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("vendors_user_id_idx").on(t.userId),
  index("vendors_category_idx").on(t.category),
  index("vendors_status_idx").on(t.status),
]);

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
