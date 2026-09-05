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

    // ── BANK PAYMENT PLAN (Banco Ombra debt restructuring) ──────────────
    // The non-CF path out of debt: instead of working it off for Pablo's
    // collector, the player can go to the bank and restructure their debt
    // into fixed installments. Enrolling moves `debt` -> the plan (debt is
    // zeroed and jailUntil cleared, so the collector stands down). The APR
    // is locked at enrollment from the player's credit score. One active
    // plan at a time; planBalance > 0 means a plan is active. Missing too
    // many installments DEFAULTS the plan: the remaining balance flows back
    // into `debt` and the collector resumes.
    planBalance: integer("plan_balance").notNull().default(0),       // remaining owed under the plan (principal + interest - paid)
    planPrincipal: integer("plan_principal").notNull().default(0),   // debt amount enrolled
    planAprBps: integer("plan_apr_bps").notNull().default(0),        // APR locked at enrollment, in basis points
    planInstallment: integer("plan_installment").notNull().default(0), // ƒ per installment
    planTerm: integer("plan_term").notNull().default(0),            // total number of installments
    planPaid: integer("plan_paid").notNull().default(0),            // installments paid so far
    planMissed: integer("plan_missed").notNull().default(0),        // installments missed (default trigger)
    planNextDueAt: timestamp("plan_next_due_at", { withTimezone: true }), // when the next installment is due
    planStartedAt: timestamp("plan_started_at", { withTimezone: true }),  // enrollment timestamp

    // ── UNEMPLOYMENT STIPEND (Pablo Corp free-trial salary) ─────────────
    // Pablo pays every arrival 500ƒ per IN-GAME hour for the first 30
    // in-game days — a spendable "free trial" wage so a broke newcomer can
    // actually use the terminal tools before they have a job or business.
    // Accrual is server-authoritative: salaryStartedAt anchors the 30-day
    // window, salaryLastClaimAt advances by whole game-hours as the player
    // collects. The credited ƒ lands in checking and is NOT quarantined.
    salaryStartedAt: timestamp("salary_started_at", { withTimezone: true }),
    salaryLastClaimAt: timestamp("salary_last_claim_at", { withTimezone: true }),
    salaryPaidTotal: integer("salary_paid_total").notNull().default(0),

    // ── VERIFIED REAL-SALARY ACCRUAL (Task: hourly verified-salary credit) ──
    // Separate, independent cursor from the unemployment stipend above. A
    // player whose real-world monthly salary is VERIFIED (automated payroll
    // provider flips world_businesses.incomeVerified, OR an admin approves the
    // declared figure in the qualification portal) earns monthlySalary/720 ƒ
    // per REAL-world hour — credited as spendable FIAT checking, NEVER Gold,
    // so the existing Gold-only cash-out gate keeps it non-withdrawable.
    //
    // Deliberately REAL-hour cadence (3_600_000 ms), unlike the stipend's
    // game-hour clock, so it survives the day/night game-clock changes. The
    // cursor advances by WHOLE real hours only; sub-hour remainders roll into
    // the next tick and repeated polls never double-pay. First touch sets the
    // cursor and pays nothing. Unverified players never set the cursor.
    verifiedSalaryLastClaimAt: timestamp("verified_salary_last_claim_at", { withTimezone: true }),
    verifiedSalaryPaidTotal: integer("verified_salary_paid_total").notNull().default(0),

    // In-game financial obligations synced from the game-save blob on every PUT
    // save. Tracks the sum of taxDebt + bountyAmount + active loan obligations
    // (principal + interest) from the client world state. Written only by the
    // save route and NEVER touched by the payment-plan or CF paths, so it never
    // collides with `debt`. Used by computeScore() as an additional penalty
    // signal. Set to 0 when the player's in-game save shows zero obligations;
    // grows totalDebtAccrued monotonically on any increase.
    inGameDebt: integer("in_game_debt").notNull().default(0),

    // Stamp set the first time onboarding rent (desk + capsule) is charged.
    // Used as the sole idempotency marker for /onboard-housing/charge so a
    // fully-paid player (no debt added) still cannot be re-billed on a
    // refresh, and concurrent calls collapse to one charge via a conditional
    // upsert that only writes when this column is NULL.
    housingChargedAt: timestamp("housing_charged_at", { withTimezone: true }),

    // QUARANTINE: starting money handed out at onboarding cannot be spent
    // on Pablo-Tax-billed features (image gen, music, bots, etc.). Only
    // money EARNED in-game (loot, work, business) counts as feature-
    // spendable. quarantineFiat is the count of starting ƒ still locked;
    // it gets decremented when the player spends ƒ on world things (food,
    // rent, vehicles), but feature-spend helpers refuse if their amount
    // would draw against the quarantined portion of the bank balance.
    quarantineFiat: integer("quarantine_fiat").notNull().default(0),
    // Same idea for any starting gold grant (currently 0 — placeholder for
    // future onboarding bundles).
    quarantineGold: integer("quarantine_gold").notNull().default(0),

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
