import { pgTable, serial, varchar, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const worldBusinessesTable = pgTable("world_businesses", {
  id: serial("id").primaryKey(),
  playerName: varchar("player_name", { length: 32 }).notNull(),
  userId: varchar("user_id", { length: 256 }),
  businessType: varchar("business_type", { length: 16 }).notNull().default("minx"), // 'minx' | 'real' | 'unemployed'
  companyName: varchar("company_name", { length: 80 }),
  industry: varchar("industry", { length: 60 }),
  companySize: varchar("company_size", { length: 30 }),
  contactEmail: varchar("contact_email", { length: 120 }),
  payrollProvider: varchar("payroll_provider", { length: 40 }),
  declaredMonthlyIncome: integer("declared_monthly_income").default(0),
  incomeVerified: boolean("income_verified").notNull().default(false),
  isPaid: boolean("is_paid").notNull().default(false),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorldBusinessSchema = createInsertSchema(worldBusinessesTable).omit({ id: true, createdAt: true });
export type InsertWorldBusiness = z.infer<typeof insertWorldBusinessSchema>;
export type WorldBusiness = typeof worldBusinessesTable.$inferSelect;
