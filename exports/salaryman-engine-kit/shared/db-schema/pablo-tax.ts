import { pgTable, serial, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Pablo Tax — per-user pay-as-you-go API metering.
 *
 * Every API call we run on behalf of a user (image gen, music gen, bot
 * inference, OpenAI chat, nano-banana, voice, etc.) is metered here at a
 * 300% markup over our raw cost. The accumulated marked-up cost lives in
 * `accruedCents`. The PABLO PRIME subscription ($145/mo) is treated as a
 * pre-paid credit — if `accruedCents <= 14_500` and the user is a Prime
 * subscriber, no incremental billing happens.
 *
 * Once `accruedCents - prepaidCents >= NEXT_BILL_THRESHOLD_CENTS` (default
 * $20), the billing waterfall fires:
 *   1. ƒ FIAT (in-game) at $1 = ƒ100
 *   2. Gold balance at $1 = 0.005 oz
 *   3. USD via Stripe (requires connected payment method)
 *   4. BTC at spot rate (requires connected wallet)
 *
 * Each $20 increment that successfully bills is recorded as a row in
 * `pablo_tax_invoices` with the bill source. The accumulator decrements
 * by the billed amount; leftover sub-$20 charges roll into the next cycle.
 */
export const pabloTaxMeterTable = pgTable(
  "pablo_tax_meter",
  {
    userId: varchar("user_id", { length: 64 }).primaryKey(),
    // YYYY-MM (UTC). Reset monthly so the Prime $145 budget resets too.
    periodYearMonth: varchar("period_year_month", { length: 7 }).notNull(),
    // Total marked-up cost accrued this period, in USD cents.
    accruedCents: integer("accrued_cents").notNull().default(0),
    // Total amount billed this period (sum of invoices), in USD cents.
    billedCents: integer("billed_cents").notNull().default(0),
    // Whether this user holds an active PABLO PRIME subscription. Prime
    // grants $145 of "free" accrual per period before incremental billing
    // kicks in. Updated by the Stripe webhook.
    primeActive: integer("prime_active").notNull().default(0), // 0|1
    // Battery system: every player's Pablo/Mila assistant ships with one free
    // starter cell, granted on first AI use. This flag makes that one-time grant
    // idempotent so a depleted-then-uninstalled assistant can't farm free cells.
    assistantBatterySeeded: integer("assistant_battery_seeded").notNull().default(0), // 0|1
    lastChargedAt: timestamp("last_charged_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    periodIdx: index("pablo_tax_meter_period_idx").on(t.periodYearMonth),
  }),
);

/**
 * Itemised log of every API call charged to Pablo Tax. We need this so the
 * user can see exactly what they're paying for ("you spent $4.20 on image
 * generation, $1.10 on music, …") and so we have an audit trail when they
 * complain about a $20 bill.
 */
export const pabloTaxLineItemsTable = pgTable(
  "pablo_tax_line_items",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    periodYearMonth: varchar("period_year_month", { length: 7 }).notNull(),
    // 'image' | 'music' | 'chat' | 'bot' | 'voice' | 'sms' | 'stripe' | 'tax' | 'other'
    kind: varchar("kind", { length: 32 }).notNull(),
    // Free-form short tag — the specific endpoint or model that ran.
    label: varchar("label", { length: 96 }).notNull(),
    // Raw cost we paid (USD cents) before markup.
    costBasisCents: integer("cost_basis_cents").notNull(),
    // What we charged the user (cost * 4 by default — 300% markup).
    chargedCents: integer("charged_cents").notNull(),
    // Idempotency key (ULID/uuid). When a caller sets one, retries with the
    // same key short-circuit instead of double-charging. Nullable for legacy
    // callers that don't yet pass one.
    requestId: varchar("request_id", { length: 80 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("pablo_tax_li_user_idx").on(t.userId),
    periodIdx: index("pablo_tax_li_period_idx").on(t.periodYearMonth),
    kindIdx: index("pablo_tax_li_kind_idx").on(t.kind),
    requestIdIdx: index("pablo_tax_li_request_id_idx").on(t.requestId),
  }),
);

/**
 * Successful $20-increment billing events. Source records WHICH part of
 * the waterfall caught the bill (fiat / gold / stripe / btc). If a single
 * bill spans sources (e.g. ƒ covered $12, Stripe covered $8), one row per
 * source is written.
 */
export const pabloTaxInvoicesTable = pgTable(
  "pablo_tax_invoices",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    periodYearMonth: varchar("period_year_month", { length: 7 }).notNull(),
    // 'fiat' | 'gold' | 'stripe' | 'btc'
    source: varchar("source", { length: 12 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    // Reference back to the source: bank tx id, gold tx id, stripe payment
    // intent id, btc tx hash. Null until the source confirms.
    sourceRef: varchar("source_ref", { length: 128 }),
    // 'pending' | 'paid' | 'failed'
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("pablo_tax_inv_user_idx").on(t.userId),
    statusIdx: index("pablo_tax_inv_status_idx").on(t.status),
  }),
);

export const insertPabloTaxLineItemSchema = createInsertSchema(pabloTaxLineItemsTable).omit({ id: true, createdAt: true });
export type InsertPabloTaxLineItem = z.infer<typeof insertPabloTaxLineItemSchema>;
export type PabloTaxLineItem = typeof pabloTaxLineItemsTable.$inferSelect;
export type PabloTaxMeter = typeof pabloTaxMeterTable.$inferSelect;
export type PabloTaxInvoice = typeof pabloTaxInvoicesTable.$inferSelect;
