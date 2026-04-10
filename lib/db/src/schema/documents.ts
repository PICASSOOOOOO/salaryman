import { pgTable, serial, varchar, text, integer, timestamp, json, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  clientName: varchar("client_name", { length: 300 }).notNull(),
  clientEmail: varchar("client_email", { length: 300 }).notNull().default(""),
  clientAddress: text("client_address").notNull().default(""),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  issueDate: varchar("issue_date", { length: 20 }).notNull(),
  dueDate: varchar("due_date", { length: 20 }).notNull(),
  lineItems: json("line_items").notNull().default([]),
  taxRate: integer("tax_rate").notNull().default(0),
  notes: text("notes").notNull().default(""),
  terms: text("terms").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoices_user_id_idx").on(table.userId),
  index("invoices_status_idx").on(table.status),
]);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  templateType: varchar("template_type", { length: 50 }).notNull(),
  partyA: varchar("party_a", { length: 300 }).notNull(),
  partyB: varchar("party_b", { length: 300 }).notNull(),
  startDate: varchar("start_date", { length: 20 }).notNull().default(""),
  endDate: varchar("end_date", { length: 20 }).notNull().default(""),
  terms: text("terms").notNull().default(""),
  scope: text("scope").notNull().default(""),
  compensation: varchar("compensation", { length: 500 }).notNull().default(""),
  jurisdiction: varchar("jurisdiction", { length: 200 }).notNull().default(""),
  extraClauses: text("extra_clauses").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contracts_user_id_idx").on(table.userId),
  index("contracts_template_idx").on(table.templateType),
]);

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;

export const filesFoldersTable = pgTable("files_folders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  parentId: integer("parent_id"),
  isFolder: boolean("is_folder").notNull().default(false),
  objectPath: varchar("object_path", { length: 1000 }),
  mimeType: varchar("mime_type", { length: 200 }),
  fileSize: integer("file_size"),
  isPublic: boolean("is_public").notNull().default(false),
  shareToken: varchar("share_token", { length: 100 }),
  isLocked: boolean("is_locked").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  source: varchar("source", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("files_folders_user_id_idx").on(table.userId),
  index("files_folders_parent_id_idx").on(table.parentId),
  index("files_folders_share_token_idx").on(table.shareToken),
  index("files_folders_expires_at_idx").on(table.expiresAt),
]);

export const insertFileFolderSchema = createInsertSchema(filesFoldersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFileFolder = z.infer<typeof insertFileFolderSchema>;
export type FileFolder = typeof filesFoldersTable.$inferSelect;
