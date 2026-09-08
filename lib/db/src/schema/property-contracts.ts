import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, jsonb, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { realEstateListingsTable } from "./real-estate-listings";

/**
 * Signed residential rental agreements. Monetary terms are copied from the
 * accepted quote and deliberately never follow future listing/market changes.
 */
export const propertyContractsTable = pgTable("property_contracts", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => realEstateListingsTable.id, { onDelete: "restrict" }),
  canonicalPropertyAddress: varchar("canonical_property_address", { length: 256 }).notNull(),
  publicSlug: varchar("public_slug", { length: 256 }).notNull(),
  landlordUserId: varchar("landlord_user_id", { length: 64 }).notNull(),
  tenantUserId: varchar("tenant_user_id", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  monthlyRentFiat: integer("monthly_rent_fiat").notNull(),
  brokerCommissionFiat: integer("broker_commission_fiat").notNull(),
  securityDepositFiat: integer("security_deposit_fiat").notNull(),
  signedMarketMultiplier: doublePrecision("signed_market_multiplier").notNull(),
  signedMarketAsOf: timestamp("signed_market_as_of", { withTimezone: true }).notNull(),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  missedPayments: integer("missed_payments").notNull().default(0),
  outstandingDebtFiat: integer("outstanding_debt_fiat").notNull().default(0),
  /** Portion of player_ledger.debt attributable to this agreement alone. */
  ledgerDebtAppliedFiat: integer("ledger_debt_applied_fiat").notNull().default(0),
  accessRestrictedAt: timestamp("access_restricted_at", { withTimezone: true }),
  // An explicit contract-level record until business credit has its own ledger.
  businessCreditPenalty: integer("business_credit_penalty").notNull().default(0),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => ({
  requestUnique: uniqueIndex("property_contracts_request_id_unique").on(t.requestId),
  tenantStatus: index("property_contracts_tenant_status_idx").on(t.tenantUserId, t.status),
  dueDate: index("property_contracts_due_date_idx").on(t.nextDueAt),
  listing: index("property_contracts_listing_idx").on(t.listingId),
  validStatus: check("property_contracts_status_check", sql`${t.status} IN ('active', 'delinquent', 'defaulted', 'completed', 'terminated')`),
  positiveTerms: check("property_contracts_positive_terms_check", sql`${t.monthlyRentFiat} > 0 AND ${t.brokerCommissionFiat} >= 0 AND ${t.securityDepositFiat} >= 0 AND ${t.signedMarketMultiplier} > 0`),
  nonnegativeState: check("property_contracts_nonnegative_state_check", sql`${t.missedPayments} >= 0 AND ${t.outstandingDebtFiat} >= 0 AND ${t.ledgerDebtAppliedFiat} >= 0 AND ${t.businessCreditPenalty} >= 0`),
  distinctParties: check("property_contracts_distinct_parties_check", sql`${t.landlordUserId} <> ${t.tenantUserId}`),
}));

/** Append-only ledger of signing, payment, delinquency, and settlement events. */
export const propertyContractEventsTable = pgTable("property_contract_events", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => propertyContractsTable.id, { onDelete: "restrict" }),
  type: varchar("type", { length: 48 }).notNull(),
  amountFiat: integer("amount_fiat").notNull().default(0),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contractCreated: index("property_contract_events_contract_created_idx").on(t.contractId, t.createdAt),
}));

export const insertPropertyContractSchema = createInsertSchema(propertyContractsTable).omit({
  id: true, signedAt: true, updatedAt: true, endedAt: true,
});
export type InsertPropertyContract = z.infer<typeof insertPropertyContractSchema>;
export type PropertyContract = typeof propertyContractsTable.$inferSelect;
export type PropertyContractEvent = typeof propertyContractEventsTable.$inferSelect;