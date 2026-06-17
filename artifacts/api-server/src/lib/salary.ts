import { db, playerLedgerTable, bankAccountsTable, bankTransactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getVerifiedMonthlySalary } from "./verified-salary";

/**
 * Pablo Corp "unemployment stipend" — the flat early-game wage.
 *
 * Every arrival is paid a flat ƒ500 lump ONCE PER IN-GAME DAY, regardless of
 * faction or spawn, so a brand-new, broke player can immediately spend on the
 * terminal tools (and survive) before they ever take a job or register a
 * business. The money is real, spendable checking balance — it is NOT
 * quarantined like the onboarding starting grant.
 *
 * The stipend is the "unemployment check": it keeps paying until the player
 * earns a WORK VISA (their real-world income is VERIFIED — see verified-salary).
 * There is NO fixed trial window; an unverified player draws the stipend
 * indefinitely, and the moment they become verified the stipend stops and the
 * (uncapped) verified salary takes over. This enforces the income cap: until a
 * work visa, the only automatic income is the flat ƒ500/day stipend — no
 * fictitious salary accrues unless it is genuinely earned.
 *
 * In-game time matches the world clock: ONE in-game day spans ONE real hour
 * (REAL_MS_PER_GAME_DAY = 3.6M ms), the same cadence the visual day/night clock
 * runs on. So the stipend pays its daily lump every real hour.
 *
 * Accrual is server-authoritative and idempotent under polling: we advance
 * salaryLastClaimAt by WHOLE game-days only, so repeated claims never
 * double-pay and any sub-day remainder rolls into the next tick.
 */
export const REAL_MS_PER_GAME_DAY = 3_600_000; // 1 real hour = 1 in-game day
export const SALARY_PER_GAME_DAY = 500; // flat daily unemployment stipend (ƒ)

export interface SalaryClaimResult {
  paid: number; // ƒ credited on THIS call (drives the +ƒ HUD animation)
  total: number; // lifetime stipend paid to this player
  perGameDay: number; // 500
  startedAt: number; // epoch ms the stipend clock began
  expiresAt: number; // epoch ms the stipend ended (0 while still active)
  expired: boolean; // stipend is over — the player earned a work visa (verified)
  remainingMs: number; // legacy field, always 0 (no fixed window any more)
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

    // The stipend ends the moment the player earns a WORK VISA — i.e. their
    // real-world income is verified and the (uncapped) verified salary takes
    // over. Until then the unemployment check keeps paying ƒ500/game-day with
    // no fixed window. A verified player accrues nothing here but we still
    // advance the cursor so they never collect a back-paid lump if verification
    // is ever revoked.
    const verified = (await getVerifiedMonthlySalary(userId, tx)) > 0;
    const gameDays = verified ? 0 : Math.max(0, Math.floor((now - lastMs) / REAL_MS_PER_GAME_DAY));
    const paid = gameDays * SALARY_PER_GAME_DAY;

    // Lock the player's FIAT accounts (mirrors spendEarnedFiat).
    let accounts = await tx
      .select()
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")))
      .for("update");

    // A verified player's stipend cursor still advances so it can't back-pay.
    if (verified) {
      const advanced = new Date(now);
      await tx
        .update(playerLedgerTable)
        .set({ salaryLastClaimAt: advanced })
        .where(eq(playerLedgerTable.userId, userId));
      lastMs = now;
    }

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
    // No fixed window any more: the stipend only "expires" when the player is
    // verified (work visa). While active there is no countdown, just the time
    // until the next whole game-day's lump accrues.
    const expired = verified;
    const remainingMs = 0;
    const intoDay = Math.max(0, now - lastMs);
    const nextDayInMs = expired ? 0 : Math.max(0, REAL_MS_PER_GAME_DAY - intoDay);

    return {
      paid,
      total,
      perGameDay: SALARY_PER_GAME_DAY,
      startedAt: startedMs,
      expiresAt: expired ? now : 0,
      expired,
      remainingMs,
      nextDayInMs,
      balance: totalFiat,
      spendable,
    };
  });
}
