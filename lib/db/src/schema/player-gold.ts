import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const playerGoldAccountsTable = pgTable("player_gold_accounts", {
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  balanceTenths: integer("balance_tenths").notNull().default(0),
  migrationVersion: integer("migration_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: "player_gold_accounts_pk", columns: [t.userId, t.slotIndex] }),
  balanceCheck: check("player_gold_accounts_balance_check", sql`${t.balanceTenths} >= 0`),
}));

export const goldConversionQuotesTable = pgTable("gold_conversion_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  side: varchar("side", { length: 8 }).notNull(),
  goldTenths: integer("gold_tenths").notNull(),
  grossFiat: integer("gross_fiat").notNull(),
  feeFiat: integer("fee_fiat").notNull(),
  settledFiat: integer("settled_fiat").notNull(),
  fiatPerGold: integer("fiat_per_gold").notNull(),
  btcUsdCents: integer("btc_usd_cents").notNull(),
  marketSource: varchar("market_source", { length: 32 }).notNull(),
  marketAsOf: timestamp("market_as_of", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  executionIdempotencyKey: varchar("execution_idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userSlotIdx: index("gold_conversion_quotes_user_slot_idx").on(t.userId, t.slotIndex, t.createdAt),
  executionIdempotencyUnique: uniqueIndex("gold_conversion_quotes_execute_idem_uq")
    .on(t.userId, t.slotIndex, t.executionIdempotencyKey),
  sideCheck: check("gold_conversion_quotes_side_check", sql`${t.side} in ('buy', 'sell')`),
  goldCheck: check("gold_conversion_quotes_gold_check", sql`${t.goldTenths} > 0`),
}));

export const goldConversionTransactionsTable = pgTable("gold_conversion_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  quoteId: uuid("quote_id").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  side: varchar("side", { length: 8 }).notNull(),
  goldDeltaTenths: integer("gold_delta_tenths").notNull(),
  fiatDelta: integer("fiat_delta").notNull(),
  feeFiat: integer("fee_fiat").notNull(),
  goldBalanceAfterTenths: integer("gold_balance_after_tenths").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userSlotIdx: index("gold_conversion_transactions_user_slot_idx").on(t.userId, t.slotIndex, t.createdAt),
  idempotencyUnique: uniqueIndex("gold_conversion_transactions_idem_uq").on(t.userId, t.slotIndex, t.idempotencyKey),
}));

export type PlayerGoldAccount = typeof playerGoldAccountsTable.$inferSelect;
export type GoldConversionQuote = typeof goldConversionQuotesTable.$inferSelect;
export type GoldConversionTransaction = typeof goldConversionTransactionsTable.$inferSelect;