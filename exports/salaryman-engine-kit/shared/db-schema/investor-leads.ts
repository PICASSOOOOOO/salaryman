import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const investorLeadsTable = pgTable("investor_leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  investmentRange: text("investment_range"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvestorLeadSchema = createInsertSchema(investorLeadsTable).omit({ id: true, createdAt: true });
export type InsertInvestorLead = z.infer<typeof insertInvestorLeadSchema>;
export type InvestorLead = typeof investorLeadsTable.$inferSelect;
