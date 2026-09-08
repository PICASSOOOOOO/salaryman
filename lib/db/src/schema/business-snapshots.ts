import { pgTable, serial, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessSnapshotsTable = pgTable("business_snapshots", {
  id: serial("id").primaryKey(),
  playerName: varchar("player_name", { length: 32 }).notNull(),
  userId: varchar("user_id", { length: 256 }),
  slotIndex: integer("slot_index").notNull().default(0),
  balance: integer("balance").notNull().default(0),
  salary: integer("salary").notNull().default(0),
  businessProfit: integer("business_profit").notNull().default(0),
  governmentBaseSalary: integer("government_base_salary").notNull().default(0),
  realSalaryAmount: integer("real_salary_amount").notNull().default(0),
  incomeType: varchar("income_type", { length: 16 }).notNull().default("unemployed"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  snapshotReason: varchar("snapshot_reason", { length: 64 }).notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBusinessSnapshotSchema = createInsertSchema(businessSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertBusinessSnapshot = z.infer<typeof insertBusinessSnapshotSchema>;
export type BusinessSnapshot = typeof businessSnapshotsTable.$inferSelect;
