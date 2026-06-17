import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Per-user Plaid API credentials (bring-your-own, like the trading system's
// per-user broker keys). Each user supplies their OWN Plaid client_id + secret
// from dashboard.plaid.com — the platform never provides a shared key. Both are
// stored encrypted at rest. This is what powers their personal bank linking.
export const userBankingCredentialsTable = pgTable(
  "user_banking_credentials",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    provider: varchar("provider", { length: 20 }).default("plaid").notNull(),
    encryptedClientId: text("encrypted_client_id").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    // Plaid environment: sandbox | development | production.
    env: varchar("env", { length: 20 }).default("sandbox").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("user_banking_credentials_user_idx").on(t.userId)],
);

export const insertUserBankingCredentialsSchema = createInsertSchema(userBankingCredentialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserBankingCredentials = z.infer<typeof insertUserBankingCredentialsSchema>;
export type UserBankingCredentials = typeof userBankingCredentialsTable.$inferSelect;

// A single real-world bank account surfaced through an aggregation provider
// (Plaid). Balances are stored in MAJOR units (e.g. dollars, not cents) as
// returned by the provider, alongside the account's native ISO currency code.
export interface RealBankAccountSnapshot {
  accountId: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  currency: string;
  balanceCurrent: number | null;
  balanceAvailable: number | null;
}

// View-only links between a SALARYMAN user and their real financial
// institutions. This is COMPLETELY separate from the in-game FIAT bank
// (see ./bank.ts) — no money ever moves here, we only read balances.
// The provider access token is stored encrypted at rest.
export const realBankConnectionsTable = pgTable(
  "real_bank_connections",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    provider: varchar("provider", { length: 20 }).default("plaid").notNull(),
    // Provider-side identifier for the linked institution session (Plaid item_id).
    itemId: text("item_id"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    // Per-account balance snapshots (RealBankAccountSnapshot[]).
    accounts: jsonb("accounts").$type<RealBankAccountSnapshot[]>().default([]).notNull(),
    // Cached sum of all account current balances converted to USD, in cents,
    // for quick overview rendering without re-hitting the provider.
    cachedTotalUsdCents: integer("cached_total_usd_cents").default(0).notNull(),
    status: varchar("status", { length: 20 }).default("connected").notNull(),
    lastError: text("last_error"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("real_bank_connections_user_idx").on(t.userId)],
);

export const insertRealBankConnectionSchema = createInsertSchema(realBankConnectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRealBankConnection = z.infer<typeof insertRealBankConnectionSchema>;
export type RealBankConnection = typeof realBankConnectionsTable.$inferSelect;
