import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Per-player ledger for the debt / credit / Collections-Facility loop.
 *
 * One row per user. Negative balances accrue to `debt` (denominated in ƒ);
 * the credit-score engine derives a 400-800 score from `negativeBalanceDays`
 * and `jailVisits`. CF (Collections Facility, formerly "jail") timestamps
 * live here because they're consulted on every world tick.
 *
 * Why a dedicated table instead of bolting onto bank_accounts:
 *   - bank_accounts is per-account (user can have many); debt is per-player.
 *   - Credit score updates hourly real-time and we want a single row to lock.
 *   - CF state needs to be readable without scanning the bank tx history.
 */
export const playerLedgerTable = pgTable(
  "player_ledger",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull().unique(),

    // Money the player owes Pablo Corp. Always >= 0. Negative bank balance
    // is converted into debt by the nightly settlement job.
    debt: integer("debt").notNull().default(0),
    // Lifetime debt accrued — never decreases. Used by the credit engine to
    // distinguish a one-time slip from a chronic deadbeat.
    totalDebtAccrued: integer("total_debt_accrued").notNull().default(0),

    // Collections Facility state (CF was jail).
    // jailUntil is epoch-ms; null = free. Players cannot move while jailed.
    jailUntil: timestamp("jail_until", { withTimezone: true }),
    // Lifetime minutes served — used as a credit-score signal.
    jailMinutesServed: integer("jail_minutes_served").notNull().default(0),
    // Number of times the player has been arrested. Each visit shaves credit.
    jailVisits: integer("jail_visits").notNull().default(0),

    // Days the player has held a negative bank balance. Hourly cron tick
    // increments this when total balance < 0; that drives the credit decay.
    negativeBalanceDays: integer("negative_balance_days").notNull().default(0),
    lastNegativeAt: timestamp("last_negative_at", { withTimezone: true }),

    // Credit score, 400-800 (real-world FICO-style range). Recomputed hourly
    // by the credit engine; cached here so price multipliers are fast.
    creditScore: integer("credit_score").notNull().default(680),
    lastScoreUpdate: timestamp("last_score_update", { withTimezone: true }).notNull().defaultNow(),

    // Last time the user tapped the CF "work" button. Rate-limits the
    // ƒ1000/min payoff so they can't replay-attack the endpoint.
    lastCfWorkAt: timestamp("last_cf_work_at", { withTimezone: true }),

    // Stamp set the first time onboarding rent (desk + capsule) is charged.
    // Used as the sole idempotency marker for /onboard-housing/charge so a
    // fully-paid player (no debt added) still cannot be re-billed on a
    // refresh, and concurrent calls collapse to one charge via a conditional
    // upsert that only writes when this column is NULL.
    housingChargedAt: timestamp("housing_charged_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("player_ledger_user_idx").on(t.userId),
    jailIdx: index("player_ledger_jail_idx").on(t.jailUntil),
  }),
);

export const insertPlayerLedgerSchema = createInsertSchema(playerLedgerTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlayerLedger = z.infer<typeof insertPlayerLedgerSchema>;
export type PlayerLedger = typeof playerLedgerTable.$inferSelect;
