import { db, playerLedgerTable, bankAccountsTable, bankTransactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Pablo Corp "unemployment stipend" — the early-game free-trial wage.
 *
 * Every arrival is paid 500ƒ per IN-GAME hour for the first 30 in-game days,
 * so a brand-new, broke player can immediately spend on the terminal tools
 * (and survive) before they ever take a job or register a business. The
 * money is real, spendable checking balance — it is NOT quarantined like the
 * onboarding starting grant.
 *
 * In-game time matches the world clock: REAL_MS_PER_GAME_DAY = 7.2M ms
 * (2 real hours = 1 game day), so one game hour = 300_000 ms (5 real min).
 * The 30-game-day trial window is therefore 60 real hours from first claim.
 *
 * Accrual is server-authoritative and idempotent under polling: we advance
 * salaryLastClaimAt by WHOLE game-hours only, so repeated claims never
 * double-pay and any sub-hour remainder rolls into the next tick.
 */
export const REAL_MS_PER_GAME_DAY = 7_200_000;
export const REAL_MS_PER_GAME_HOUR = REAL_MS_PER_GAME_DAY / 24; // 300_000
export const SALARY_PER_GAME_HOUR = 500;
export const SALARY_TRIAL_GAME_DAYS = 30;
export const SALARY_TRIAL_WINDOW_MS = SALARY_TRIAL_GAME_DAYS * REAL_MS_PER_GAME_DAY;

export interface SalaryClaimResult {
  paid: number; // ƒ credited on THIS call (drives the +ƒ HUD animation)
  total: number; // lifetime stipend paid to this player
  perGameHour: number; // 500
  startedAt: number; // epoch ms the stipend window began
  expiresAt: number; // epoch ms the 30-game-day window ends
  expired: boolean; // window has passed (stipend is over)
  remainingMs: number; // real ms until the window ends (0 if expired)
  nextHourInMs: number; // real ms until the next whole game-hour accrues
  balance: number; // total FIAT balance after credit (wallet display)
  spendable: number; // balance minus quarantined starting grant
}

/**
 * Accrue + pay any owed stipend and return the current state. Safe to call
 * repeatedly (e.g. the office HUD polls it on a timer): it pays only whole
 * game-hours and returns paid=0 when nothing is owed yet.
 */
export async function claimSalary(userId: string): Promise<SalaryClaimResult> {
  return await db.transaction(async (tx) => {
    // Ensure a ledger row exists, then lock it for the accrual math.
    await tx.insert(playerLedgerTable).values({ userId }).onConflictDoNothing();
    const [led] = await tx
      .select()
      .from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId))
      .for("update")
      .limit(1);

    const now = Date.now();
    let startedMs = led?.salaryStartedAt ? new Date(led.salaryStartedAt).getTime() : null;
    let lastMs = led?.salaryLastClaimAt ? new Date(led.salaryLastClaimAt).getTime() : null;
    const quarantine = led?.quarantineFiat ?? 0;
    let total = led?.salaryPaidTotal ?? 0;

    // First touch: start the stipend clock now, pay nothing yet.
    if (startedMs == null) {
      const d = new Date(now);
      await tx
        .update(playerLedgerTable)
        .set({ salaryStartedAt: d, salaryLastClaimAt: d })
        .where(eq(playerLedgerTable.userId, userId));
      startedMs = now;
      lastMs = now;
    }
    if (lastMs == null) lastMs = startedMs;

    const expiresAt = startedMs + SALARY_TRIAL_WINDOW_MS;
    const effectiveNow = Math.min(now, expiresAt);
    const gameHours = Math.max(0, Math.floor((effectiveNow - lastMs) / REAL_MS_PER_GAME_HOUR));
    const paid = gameHours * SALARY_PER_GAME_HOUR;

    // Lock the player's FIAT accounts (mirrors spendEarnedFiat).
    let accounts = await tx
      .select()
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")))
      .for("update");

    if (paid > 0) {
      if (accounts.length === 0) {
        const [created] = await tx
          .insert(bankAccountsTable)
          .values({ userId, kind: "checking", label: "STANDARD CHECKING", balance: 0, currency: "FIAT", apyBps: 0 })
          .returning();
        accounts = [created];
      }
      const checking = accounts.find((a) => a.kind === "checking") ?? accounts[0];
      const newBal = (checking.balance || 0) + paid;
      await tx
        .update(bankAccountsTable)
        .set({ balance: newBal, updatedAt: new Date() })
        .where(eq(bankAccountsTable.id, checking.id));
      await tx.insert(bankTransactionsTable).values({
        userId,
        accountId: checking.id,
        kind: "deposit",
        description: "Pablo Corp unemployment stipend",
        amount: paid,
        balanceAfter: newBal,
      });
      checking.balance = newBal; // reflect for the total below

      const newLast = new Date(lastMs + gameHours * REAL_MS_PER_GAME_HOUR);
      total += paid;
      await tx
        .update(playerLedgerTable)
        .set({ salaryLastClaimAt: newLast, salaryPaidTotal: total })
        .where(eq(playerLedgerTable.userId, userId));
      lastMs = newLast.getTime();
    }

    const totalFiat = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const spendable = Math.max(0, totalFiat - quarantine);
    const remainingMs = Math.max(0, expiresAt - now);
    const expired = now >= expiresAt;
    const intoHour = Math.max(0, Math.min(now, expiresAt) - lastMs);
    const nextHourInMs = expired ? 0 : Math.max(0, REAL_MS_PER_GAME_HOUR - intoHour);

    return {
      paid,
      total,
      perGameHour: SALARY_PER_GAME_HOUR,
      startedAt: startedMs,
      expiresAt,
      expired,
      remainingMs,
      nextHourInMs,
      balance: totalFiat,
      spendable,
    };
  });
}
