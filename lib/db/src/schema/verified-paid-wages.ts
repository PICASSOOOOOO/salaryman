import { pgTable, serial, integer, varchar, numeric, date, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { worldBusinessesTable } from "./world-businesses";

/**
 * Immutable owner attestations for actual real-world wage payments.
 * This is separate from declared monthly salary and synthetic in-game FIAT.
 */
export const verifiedPaidWagesTable = pgTable("verified_paid_wages", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => worldBusinessesTable.id, { onDelete: "cascade" }),
  employeeUserId: varchar("employee_user_id", { length: 256 }).notNull(),
  attestedByUserId: varchar("attested_by_user_id", { length: 256 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  paidAt: date("paid_at", { mode: "string" }).notNull(),
  payPeriodStart: date("pay_period_start", { mode: "string" }).notNull(),
  payPeriodEnd: date("pay_period_end", { mode: "string" }).notNull(),
  paymentReferenceHash: varchar("payment_reference_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("verified_paid_wages_payment_ref_unique").on(t.orgId, t.employeeUserId, t.paymentReferenceHash),
  uniqueIndex("verified_paid_wages_period_unique").on(t.orgId, t.employeeUserId, t.payPeriodStart, t.payPeriodEnd),
  index("verified_paid_wages_employee_idx").on(t.employeeUserId, t.paidAt),
  check("verified_paid_wages_positive_amount", sql`${t.paidAmount} > 0 AND ${t.paidAmount} <= 100000000`),
  check("verified_paid_wages_valid_period", sql`${t.payPeriodStart} <= ${t.payPeriodEnd} AND ${t.paidAt} >= ${t.payPeriodEnd}`),
  check("verified_paid_wages_no_self_attestation", sql`${t.employeeUserId} <> ${t.attestedByUserId}`),
  check("verified_paid_wages_reference_hash", sql`${t.paymentReferenceHash} ~ '^[a-f0-9]{64}$'`),
  check("verified_paid_wages_currency_format", sql`${t.currencyCode} ~ '^[A-Z]{3}$'`),
]);

export const insertVerifiedPaidWageSchema = createInsertSchema(verifiedPaidWagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVerifiedPaidWage = z.infer<typeof insertVerifiedPaidWageSchema>;
export type VerifiedPaidWage = typeof verifiedPaidWagesTable.$inferSelect;
