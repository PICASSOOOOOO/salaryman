import { pgTable, serial, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pabloMemoriesTable = pgTable("pablo_memories", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("lesson"),
  content: text("content").notNull(),
  source: varchar("source", { length: 40 }).notNull().default("pablo"),
  weight: integer("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pablo_memories_user_id_idx").on(table.userId),
]);

export const insertPabloMemorySchema = createInsertSchema(pabloMemoriesTable).omit({ id: true, createdAt: true });
export type InsertPabloMemory = z.infer<typeof insertPabloMemorySchema>;
export type PabloMemory = typeof pabloMemoriesTable.$inferSelect;
