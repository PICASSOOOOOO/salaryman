import { pgTable, serial, integer, varchar, text, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const CRM_CUSTOM_FIELD_TYPES = ["text", "number", "boolean", "date", "select"] as const;
export type CrmCustomFieldType = (typeof CRM_CUSTOM_FIELD_TYPES)[number];

export const crmCustomFieldsTable = pgTable("crm_custom_fields", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  fieldKey: varchar("field_key", { length: 80 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  fieldType: varchar("field_type", { length: 20 }).notNull(),
  optionsJson: jsonb("options_json").$type<string[]>().notNull().default([]),
  required: boolean("required").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("crm_custom_fields_org_key_uq").on(t.orgId, t.fieldKey),
  index("crm_custom_fields_org_idx").on(t.orgId),
]);

export const insertCrmCustomFieldSchema = createInsertSchema(crmCustomFieldsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmCustomField = z.infer<typeof insertCrmCustomFieldSchema>;
export type CrmCustomField = typeof crmCustomFieldsTable.$inferSelect;