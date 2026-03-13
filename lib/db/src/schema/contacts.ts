import { pgTable, serial, text, varchar, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
