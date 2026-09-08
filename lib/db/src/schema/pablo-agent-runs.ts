import { pgTable, serial, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type PabloAgentStep = {
  n: number;
  tool: string;
  args: Record<string, unknown>;
  result: string;
};

export const pabloAgentRunsTable = pgTable("pablo_agent_runs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  goal: text("goal").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  summary: text("summary").notNull().default(""),
  steps: jsonb("steps").$type<PabloAgentStep[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pablo_agent_runs_user_id_idx").on(table.userId),
]);

export const insertPabloAgentRunSchema = createInsertSchema(pabloAgentRunsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPabloAgentRun = z.infer<typeof insertPabloAgentRunSchema>;
export type PabloAgentRun = typeof pabloAgentRunsTable.$inferSelect;
