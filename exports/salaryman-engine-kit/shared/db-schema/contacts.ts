import { pgTable, serial, text, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull().default(""),
  phone: varchar("phone").notNull().default(""),
  address: varchar("address").notNull().default(""),
  age: varchar("age").notNull().default(""),
  ethnicity: varchar("ethnicity").notNull().default(""),
  hometown: varchar("hometown").notNull().default(""),
  timezone: varchar("timezone").notNull().default(""),
  kids: varchar("kids").notNull().default(""),
  bio: text("bio").notNull().default(""),
  tag: varchar("tag", { length: 50 }).notNull().default(""),
  dealStage: varchar("deal_stage", { length: 50 }).notNull().default(""),
  dealValue: integer("deal_value"),
  company: varchar("company").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contacts_user_id_idx").on(table.userId),
  index("contacts_tag_idx").on(table.tag),
  index("contacts_deal_stage_idx").on(table.dealStage),
]);

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;

export const contactInteractionsTable = pgTable("contact_interactions", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 30 }).notNull().default("note"),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contact_interactions_contact_id_idx").on(table.contactId),
  index("contact_interactions_user_id_idx").on(table.userId),
]);

export const insertContactInteractionSchema = createInsertSchema(contactInteractionsTable).omit({ id: true, createdAt: true });
export type InsertContactInteraction = z.infer<typeof insertContactInteractionSchema>;
export type ContactInteraction = typeof contactInteractionsTable.$inferSelect;
