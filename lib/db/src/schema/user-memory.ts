import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const userMemoryTable = pgTable("user_memory", {
  userId: varchar("user_id").primaryKey(),
  memory: text("memory").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserMemory = typeof userMemoryTable.$inferSelect;
