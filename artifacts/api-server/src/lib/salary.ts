import { db, playerLedgerTable, bankAccountsTable, bankTransactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Pablo Corp "unemployment stipend" — the early-game free-trial wage.
 *
 * Every arrival is paid a lump stipend ONCE PER IN-GAME DAY for the first 30
 * in-game days, so a brand-new, broke player can immediately spend on the
 * terminal tools (and survive) before they ever take a job or register a
 * business. The money is real, spendable checking balance — it is NOT
 * quarantined like the onboarding starting grant.
 *
 * In-game time matches the world clock: ONE in-game day spans ONE real hour
 * (REAL_MS_PER_GAME_DAY = 3.6M ms), the same cadence the visual day/night clock
 * runs on. So the stipend pays its daily lump every real hour, and the
 * 30-game-day trial window is 30 real hours from first claim.
 *
 * Accrual is server-authoritative and idempotent under polling: we advance
 * salaryLastClaimAt by WHOLE game-days only, so repeated claims never
 * double-pay and any sub-day remainder rolls into the next tick.
 */
export const REAL_MS_PER_GAME_DAY = 3_600_000; // 1 real hour = 1 in-game day
export const SALARY_PER_GAME_DAY = 12_000; // daily lump stipend (ƒ)
export const SALARY_TRIAL_GAME_DAYS = 30;
export const SALARY_TRIAL_WINDOW_MS = SALARY_TRIAL_GAME_DAYS * REAL_MS_PER_GAME_DAY;

export interface SalaryClaimResult {
  paid: number; // ƒ credited on THIS call (drives the +ƒ HUD animation)
  total: number; // lifetime stipend paid to this player
  perGameDay: number; // 12000
  startedAt: number; // epoch ms the stipend window began
  expiresAt: number; // epoch ms the 30-game-day window ends
  expired: boolean; // window has passed (stipend is over)
  remainingMs: number; // real ms until the window ends (0 if expired)
  nextDayInMs: number; // real ms until the next whole game-day accrues
  balance: number; // total FIAT balance after credit (wallet display)
  spendable: number; // balance minus quarantined starting grant
}

/**
 * Accrue + pay any owed stipend and return the current state. Safe to call
 * repeatedly (e.g. the office HUD polls it on a timer): it pays only whole
 * game-days and returns paid=0 when nothing is owed yet.
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
    const gameDays = Math.max(0, Math.floor((effectiveNow - lastMs) / REAL_MS_PER_GAME_DAY));
    const paid = gameDays * SALARY_PER_GAME_DAY;

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

      const newLast = new Date(lastMs + gameDays * REAL_MS_PER_GAME_DAY);
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
    const intoDay = Math.max(0, Math.min(now, expiresAt) - lastMs);
    const nextDayInMs = expired ? 0 : Math.max(0, REAL_MS_PER_GAME_DAY - intoDay);

    return {
      paid,
      total,
      perGameDay: SALARY_PER_GAME_DAY,
      startedAt: startedMs,
      expiresAt,
      expired,
      remainingMs,
      nextDayInMs,
      balance: totalFiat,
      spendable,
    };
  });
}
