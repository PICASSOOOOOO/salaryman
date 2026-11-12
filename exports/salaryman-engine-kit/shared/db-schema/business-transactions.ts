import { pgTable, serial, varchar, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessTransactionsTable = pgTable("business_transactions", {
  id: serial("id").primaryKey(),
  playerName: varchar("player_name", { length: 32 }).notNull(),
  companyName: varchar("company_name", { length: 80 }),
  category: varchar("category", { length: 32 }).notNull().default("general"),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBusinessTransactionSchema = createInsertSchema(businessTransactionsTable).omit({ id: true, createdAt: true });
export type InsertBusinessTransaction = z.infer<typeof insertBusinessTransactionSchema>;
export type BusinessTransaction = typeof businessTransactionsTable.$inferSelect;
