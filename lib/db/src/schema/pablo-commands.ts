import { pgTable, serial, varchar, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pabloCommandsTable = pgTable("pablo_commands", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  description: varchar("description", { length: 300 }).notNull().default(""),
  kind: varchar("kind", { length: 20 }).notNull().default("agent"),
  payload: text("payload").notNull().default(""),
  icon: varchar("icon", { length: 40 }).notNull().default("Command"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pablo_commands_user_id_idx").on(table.userId),
]);

export const insertPabloCommandSchema = createInsertSchema(pabloCommandsTable).omit({ id: true, createdAt: true });
export type InsertPabloCommand = z.infer<typeof insertPabloCommandSchema>;
export type PabloCommand = typeof pabloCommandsTable.$inferSelect;
