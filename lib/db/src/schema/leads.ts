import { pgTable, serial, varchar, integer, timestamp, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "closed_won", "closed_lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leadImportsTable = pgTable("lead_imports", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id", { length: 256 }).notNull(),
  fileName: varchar("file_name", { length: 256 }),
  totalRecords: integer("total_records").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorsJson: text("errors_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lead_imports_org_id_idx").on(t.orgId),
]);

export type LeadImport = typeof leadImportsTable.$inferSelect;
export type InsertLeadImport = typeof leadImportsTable.$inferInsert;

export const leadRecordsTable = pgTable("lead_records", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  importId: integer("import_id"),
  isLocked: boolean("is_locked").notNull().default(false),
  name: varchar("name", { length: 256 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull().default(""),
  email: varchar("email", { length: 256 }).notNull().default(""),
  company: varchar("company", { length: 256 }).notNull().default(""),
  jobTitle: varchar("job_title", { length: 256 }).notNull().default(""),
  source: varchar("source", { length: 128 }).notNull().default("manual"),
  status: varchar("status", { length: 32 }).notNull().default("new"),
  assignedUserId: varchar("assigned_user_id", { length: 256 }),
  pabloNotesJson: text("pablo_notes_json"),
  lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
  callCount: integer("call_count").notNull().default(0),
  createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("lead_records_org_id_idx").on(t.orgId),
  index("lead_records_status_idx").on(t.status),
  index("lead_records_assigned_user_id_idx").on(t.assignedUserId),
  index("lead_records_import_id_idx").on(t.importId),
]);

export const insertLeadRecordSchema = createInsertSchema(leadRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeadRecord = z.infer<typeof insertLeadRecordSchema>;
export type LeadRecord = typeof leadRecordsTable.$inferSelect;

export const leadNotesTable = pgTable("lead_notes", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadRecordsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 256 }).notNull(),
  userName: varchar("user_name", { length: 128 }),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("lead_notes_lead_id_idx").on(t.leadId),
  index("lead_notes_user_id_idx").on(t.userId),
]);

export type LeadNote = typeof leadNotesTable.$inferSelect;
export type InsertLeadNote = typeof leadNotesTable.$inferInsert;
