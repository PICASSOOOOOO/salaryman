import { pgTable, serial, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dealsTable = pgTable("deals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  stage: varchar("stage", { length: 50 }).notNull().default("Lead"),
  value: integer("value"),
  contactId: integer("contact_id"),
  contactName: varchar("contact_name", { length: 300 }),
  expectedCloseDate: varchar("expected_close_date", { length: 20 }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("deals_user_id_idx").on(table.userId),
  index("deals_stage_idx").on(table.stage),
]);

export const insertDealSchema = createInsertSchema(dealsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
