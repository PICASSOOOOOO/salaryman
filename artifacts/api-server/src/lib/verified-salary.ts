import { db, playerLedgerTable, bankAccountsTable, bankTransactionsTable, worldBusinessesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

/**
 * Verified real-salary hourly credit.
 *
 * A player whose real-world monthly salary is VERIFIED earns
 * `monthlySalary / 720` ƒ per REAL-world hour (720 = 30 days × 24 h), credited
 * as spendable FIAT checking. The credit is intentionally FIAT (never Gold) so
 * the existing Gold-only cash-out gate keeps it non-withdrawable to real money
 * — spendable in-game (gear, tools, rent), but not cashable.
 *
 * Verification has two paths, both surfaced as world_businesses.incomeVerified:
 *   1. Automated payroll provider (Gusto/ADP) — set at registration.
 *   2. Admin qualification portal — an admin approves a declared salary.
 *
 * Accrual is server-authoritative and idempotent under polling: the cursor
 * (player_ledger.verifiedSalaryLastClaimAt) advances by WHOLE real hours only,
 * so repeated claims never double-pay and any sub-hour remainder rolls into the
 * next tick. Cadence is REAL time (not the in-game clock) so it is unaffected
 * by the day/night game-clock. First touch sets the cursor and pays nothing;
 * an unverified player never sets the cursor and accrues nothing.
 */
export const REAL_MS_PER_HOUR = 3_600_000;
export const HOURS_PER_MONTH = 720; // 30 days × 24 h

export interface VerifiedSalaryResult {
  verified: boolean; // is the player's monthly salary verified right now
  monthlySalary: number; // verified real-world monthly figure (0 if unverified)
  hourlyRate: number; // ƒ per real hour = floor(monthlySalary / 720)
  paid: number; // ƒ credited on THIS call (drives the +ƒ HUD animation)
  total: number; // lifetime verified-salary ƒ paid to this player
  lastClaimAt: number | null; // epoch ms of the accrual cursor (null until first touch)
  nextHourInMs: number; // real ms until the next whole hour accrues (0 if unverified)
  balance: number; // total FIAT balance after credit (wallet display)
  spendable: number; // balance minus quarantined starting grant
  // A real-business owner who declared a salary but isn't verified yet is, in
  // PABLO CORP's eyes, "legally unemployed / awaiting a work visa": they draw
  // the unemployment stipend (not their declared salary) until verification
  // clears. These fields let the HUD say so instead of silently showing ƒ0.
  awaitingVerification: boolean; // has an unverified real business with a declared salary
  pendingMonthlySalary: number; // the declared (but not-yet-verified) monthly figure
  pendingHourlyRate: number; // ƒ per real hour that WILL apply once verified
}

/**
 * Pure accrual math, extracted so it can be unit-tested without a DB. Given the
 * current cursor (epoch ms, or null for first touch), the current time, and the
 * hourly rate, returns how much to pay and where the cursor should land.
 *
 * - First touch (lastMs == null): pay nothing, anchor the cursor at `now`.
 * - Otherwise pay `floor((now - lastMs) / 3_600_000) * hourlyRate` and advance
 *   the cursor by exactly that many whole hours (sub-hour remainder preserved).
 * - A zero/negative rate (unverified or sub-720 salary) always pays nothing.
 */
export function accrueWholeHours(
  lastMs: number | null,
  now: number,
  hourlyRate: number,
): { paid: number; newLastMs: number; hours: number } {
  if (lastMs == null) {
    return { paid: 0, newLastMs: now, hours: 0 };
  }
  if (hourlyRate <= 0 || now <= lastMs) {
    return { paid: 0, newLastMs: lastMs, hours: 0 };
  }
  const hours = Math.floor((now - lastMs) / REAL_MS_PER_HOUR);
  if (hours <= 0) {
    return { paid: 0, newLastMs: lastMs, hours: 0 };
  }
  return {
    paid: hours * hourlyRate,
    newLastMs: lastMs + hours * REAL_MS_PER_HOUR,
    hours,
  };
}

/**
 * The verified monthly salary for a player = the declaredMonthlyIncome of their
 * most recent real-business registration whose income has been verified. Returns
 * 0 when the player has no verified real salary.
 */
export async function getVerifiedMonthlySalary(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any = db,
): Promise<number> {
  const [row] = await conn
    .select({ declared: worldBusinessesTable.declaredMonthlyIncome })
    .from(worldBusinessesTable)
    .where(and(
      eq(worldBusinessesTable.userId, userId),
      eq(worldBusinessesTable.businessType, "real"),
      eq(worldBusinessesTable.incomeVerified, true),
    ))
    .orderBy(desc(worldBusinessesTable.createdAt))
    .limit(1);
  return Math.max(0, Number(row?.declared ?? 0) || 0);
}

/**
 * The PENDING monthly salary for a player = the declaredMonthlyIncome of their
 * most recent real-business registration that has a declared figure but is NOT
 * yet verified. Returns 0 when there is no such "awaiting work visa" business.
 * This is the figure that WILL become their salary once verification clears; in
 * the meantime they stay on the unemployment stipend.
 */
export async function getPendingMonthlySalary(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any = db,
): Promise<number> {
  const [row] = await conn
    .select({ declared: worldBusinessesTable.declaredMonthlyIncome })
    .from(worldBusinessesTable)
    .where(and(
      eq(worldBusinessesTable.userId, userId),
      eq(worldBusinessesTable.businessType, "real"),
      eq(worldBusinessesTable.incomeVerified, false),
    ))
    .orderBy(desc(worldBusinessesTable.createdAt))
    .limit(1);
  return Math.max(0, Number(row?.declared ?? 0) || 0);
}

/**
 * Accrue + pay any owed verified salary and return the current state. Safe to
 * call repeatedly (the office HUD polls it on a timer): it pays only whole real
 * hours and returns paid=0 when nothing is owed yet (or the salary is not
 * verified).
 */
export async function claimVerifiedSalary(userId: string): Promise<VerifiedSalaryResult> {
  return await db.transaction(async (tx) => {
    // Ensure a ledger row exists, then lock it for the accrual math.
    await tx.insert(playerLedgerTable).values({ userId }).onConflictDoNothing();
    const [led] = await tx
      .select()
      .from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId))
      .for("update")
      .limit(1);

    const monthlySalary = await getVerifiedMonthlySalary(userId, tx);
    const verified = monthlySalary > 0;
    const hourlyRate = verified ? Math.floor(monthlySalary / HOURS_PER_MONTH) : 0;

    // "Awaiting work visa": a real business owner who declared a salary but
    // hasn't been verified yet. They stay on the stipend (this path pays them
    // nothing) but the HUD should explain WHY rather than show a silent ƒ0.
    const pendingMonthlySalary = verified ? 0 : await getPendingMonthlySalary(userId, tx);
    const awaitingVerification = !verified && pendingMonthlySalary > 0;
    const pendingHourlyRate = awaitingVerification ? Math.floor(pendingMonthlySalary / HOURS_PER_MONTH) : 0;

    const now = Date.now();
    const quarantine = led?.quarantineFiat ?? 0;
    let lastMs = led?.verifiedSalaryLastClaimAt ? new Date(led.verifiedSalaryLastClaimAt).getTime() : null;
    let total = led?.verifiedSalaryPaidTotal ?? 0;

    // Lock the player's FIAT accounts (mirrors the stipend path).
    let accounts = await tx
      .select()
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")))
      .for("update");

    let paid = 0;
    if (verified) {
      if (lastMs == null) {
        // First verified touch: anchor the cursor now, pay nothing this call.
        const d = new Date(now);
        await tx
          .update(playerLedgerTable)
          .set({ verifiedSalaryLastClaimAt: d })
          .where(eq(playerLedgerTable.userId, userId));
        lastMs = now;
      } else {
        const acc = accrueWholeHours(lastMs, now, hourlyRate);
        paid = acc.paid;
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
            description: "Verified salary",
            amount: paid,
            balanceAfter: newBal,
          });
          checking.balance = newBal; // reflect for the total below
          total += paid;
        }
        const newLast = new Date(acc.newLastMs);
        await tx
          .update(playerLedgerTable)
          .set({ verifiedSalaryLastClaimAt: newLast, verifiedSalaryPaidTotal: total })
          .where(eq(playerLedgerTable.userId, userId));
        lastMs = acc.newLastMs;
      }
    }

    const totalFiat = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const spendable = Math.max(0, totalFiat - quarantine);
    const intoHour = lastMs != null ? Math.max(0, now - lastMs) : 0;
    const nextHourInMs = verified ? Math.max(0, REAL_MS_PER_HOUR - intoHour) : 0;

    return {
      verified,
      monthlySalary,
      hourlyRate,
      paid,
      total,
      lastClaimAt: lastMs,
      nextHourInMs,
      balance: totalFiat,
      spendable,
      awaitingVerification,
      pendingMonthlySalary,
      pendingHourlyRate,
    };
  });
}
