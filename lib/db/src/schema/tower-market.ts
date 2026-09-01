import { integer, pgTable, serial, timestamp, uniqueIndex, varchar, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const towerMarketHoldingsTable = pgTable("tower_market_holdings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  companyKey: varchar("company_key", { length: 80 }).notNull(),
  shares: integer("shares").notNull().default(0),
  averageCostFiat: integer("average_cost_fiat").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tower_market_holdings_user_company_unique").on(t.userId, t.companyKey),
  index("tower_market_holdings_company_idx").on(t.companyKey),
  check("tower_market_holdings_shares_check", sql`${t.shares} >= 0`),
]);

export const towerMarketTradesTable = pgTable("tower_market_trades", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  companyKey: varchar("company_key", { length: 80 }).notNull(),
  ticker: varchar("ticker", { length: 8 }).notNull(),
  side: varchar("side", { length: 8 }).notNull(),
  shares: integer("shares").notNull(),
  priceFiat: integer("price_fiat").notNull(),
  totalFiat: integer("total_fiat").notNull(),
  requestId: varchar("request_id", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tower_market_trades_user_request_unique").on(t.userId, t.requestId),
  index("tower_market_trades_company_created_idx").on(t.companyKey, t.createdAt),
  index("tower_market_trades_user_created_idx").on(t.userId, t.createdAt),
  check("tower_market_trades_side_check", sql`${t.side} in ('buy', 'sell')`),
  check("tower_market_trades_shares_check", sql`${t.shares} > 0`),
  check("tower_market_trades_price_check", sql`${t.priceFiat} > 0 and ${t.totalFiat} > 0`),
]);

export type TowerMarketHolding = typeof towerMarketHoldingsTable.$inferSelect;
export type TowerMarketTrade = typeof towerMarketTradesTable.$inferSelect;