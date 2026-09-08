import { pgTable, serial, varchar, timestamp, unique, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Player City Visas ────────────────────────────────────────────────────────
// Tracks which cities a player has authorization to enter.
// status 'visa'     → entry permitted
// status 'applicant' → citizenship applied, awaiting admin decision
// status 'citizen'  → full citizenship granted
export const CITY_VISA_STATUSES = ['visa', 'applicant', 'citizen'] as const;
export type CityVisaStatus = (typeof CITY_VISA_STATUSES)[number];

export const playerCityVisasTable = pgTable("player_city_visas", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  cityId: varchar("city_id", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("visa").$type<CityVisaStatus>(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("player_city_visas_user_city").on(t.userId, t.cityId),
]);

export const insertPlayerCityVisaSchema = createInsertSchema(playerCityVisasTable).omit({ id: true, grantedAt: true, updatedAt: true });
export type InsertPlayerCityVisa = z.infer<typeof insertPlayerCityVisaSchema>;
export type PlayerCityVisa = typeof playerCityVisasTable.$inferSelect;

// ─── Business Tax Payments ────────────────────────────────────────────────────
// Monthly 50% business income tax ledger. One row per (userId, cityId, period).
// status 'owed'  → tax assessed, not yet deducted from player wallet
// status 'paid'  → successfully deducted from player ƒ wallet
// status 'debt'  → wallet insufficient; shortfall recorded as Banco Ombra debt
export const BUSINESS_TAX_STATUSES = ['owed', 'paid', 'debt'] as const;
export type BusinessTaxStatus = (typeof BUSINESS_TAX_STATUSES)[number];

export const businessTaxPaymentsTable = pgTable("business_tax_payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  cityId: varchar("city_id", { length: 64 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(), // 'YYYY-MM'
  netProfit: numeric("net_profit", { precision: 14, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 16 }).notNull().default("owed").$type<BusinessTaxStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (t) => [
  unique("business_tax_payments_user_city_period").on(t.userId, t.cityId, t.period),
]);

export const insertBusinessTaxPaymentSchema = createInsertSchema(businessTaxPaymentsTable).omit({ id: true, createdAt: true, settledAt: true });
export type InsertBusinessTaxPayment = z.infer<typeof insertBusinessTaxPaymentSchema>;
export type BusinessTaxPayment = typeof businessTaxPaymentsTable.$inferSelect;
