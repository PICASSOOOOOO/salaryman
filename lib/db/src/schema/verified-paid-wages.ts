import { pgTable, serial, integer, varchar, numeric, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
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
  paidAt: date("paid_at").notNull(),
  payPeriodStart: date("pay_period_start").notNull(),
  payPeriodEnd: date("pay_period_end").notNull(),
  paymentReferenceHash: varchar("payment_reference_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("verified_paid_wages_payment_ref_unique").on(t.orgId, t.employeeUserId, t.paymentReferenceHash),
  uniqueIndex("verified_paid_wages_period_unique").on(t.orgId, t.employeeUserId, t.payPeriodStart, t.payPeriodEnd),
  index("verified_paid_wages_employee_idx").on(t.employeeUserId, t.paidAt),
]);
