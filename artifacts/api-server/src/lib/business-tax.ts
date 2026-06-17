// ─── Business Income Tax Audit ───────────────────────────────────────────────
// Runs once per calendar month. For every player who owns a registered business
// in a city and posted net profit in the prior calendar month (using their
// real enterprise financials: paid invoices as revenue, balance-sheet outflows
// as expenses), deducts 50% tax from their server-side player ledger.
//
// Tax rate: 50% (BUSINESS_TAX_RATE). Hardcoded per spec — not UI-configurable.
//
// If the player's current ƒ balance (player_ledger.debt credit) is insufficient,
// the shortfall is recorded as tax debt on the ledger (Banco Ombra path).
// A `business_tax_payments` row tracks the audit for accounting + admin review.

import {
  db,
  businessTaxPaymentsTable,
  salarymanSavesTable,
  worldBusinessesTable,
  playerLedgerTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";

const BUSINESS_TAX_RATE = 0.5;

// System-config key to persist the last audit month so a restart doesn't
// re-run the same month twice. We store it in world_kv.
const TAX_AUDIT_KV_KEY = "business_tax_last_audit_period";

// ── Revenue / expense queries ─────────────────────────────────────────────────
// Revenue = sum of paid invoices in the target month.
// Expenses = sum of balance_sheet_transactions (expense / bill / payroll) in
// the target month. Uses the same guards as the finance-engine reconcile audit.
async function getMonthlyRevenue(userId: string, periodStart: string, periodEnd: string): Promise<number> {
  const rows = await db.execute<{ total: string }>(
    sql`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM invoices
      WHERE user_id = ${userId}
        AND status = 'paid'
        AND paid_at >= ${periodStart}::timestamptz
        AND paid_at <  ${periodEnd}::timestamptz
    `
  );
  return Number(rows.rows[0]?.total ?? 0);
}

async function getMonthlyExpenses(userId: string, periodStart: string, periodEnd: string): Promise<number> {
  const rows = await db.execute<{ total: string }>(
    sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM balance_sheet_transactions
      WHERE user_id = ${userId}
        AND type IN ('expense', 'bill', 'payroll')
        AND created_at >= ${periodStart}::timestamptz
        AND created_at <  ${periodEnd}::timestamptz
    `
  );
  return Number(rows.rows[0]?.total ?? 0);
}

// ── City resolution ───────────────────────────────────────────────────────────
// Derive a player's city from their most recent save blob (data->>'cityId').
// Falls back to 'minx_city' for old saves that pre-date the multi-city launch.
async function resolvePlayerCity(userId: string): Promise<string> {
  const rows = await db
    .select({ data: salarymanSavesTable.data })
    .from(salarymanSavesTable)
    .where(eq(salarymanSavesTable.userId, userId))
    .orderBy(salarymanSavesTable.lastSavedAt)
    .limit(1);
  const cityId = rows[0]?.data?.cityId;
  return typeof cityId === "string" && cityId ? cityId : "minx_city";
}

// ── Last-audit period retrieval ───────────────────────────────────────────────
async function getLastAuditPeriod(): Promise<string | null> {
  const rows = await db.execute<{ value: string }>(
    sql`SELECT value FROM world_kv WHERE key = ${TAX_AUDIT_KV_KEY} LIMIT 1`
  );
  return rows.rows[0]?.value ?? null;
}

async function setLastAuditPeriod(period: string): Promise<void> {
  await db.execute(
    sql`
      INSERT INTO world_kv (key, value, updated_at)
      VALUES (${TAX_AUDIT_KV_KEY}, ${period}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${period}, updated_at = now()
    `
  );
}

// ── Prior calendar month helpers ──────────────────────────────────────────────
function priorMonthPeriod(now: Date): { period: string; periodStart: string; periodEnd: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const priorMonth = month === 0 ? 12 : month;
  const priorYear = month === 0 ? year - 1 : year;
  const period = `${priorYear}-${String(priorMonth).padStart(2, "0")}`;
  const periodStart = `${priorYear}-${String(priorMonth).padStart(2, "0")}-01`;
  const nextYear = priorMonth === 12 ? year : priorYear;
  const nextMonth = priorMonth === 12 ? 1 : priorMonth + 1;
  const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { period, periodStart, periodEnd };
}

// ── Main audit entry point ─────────────────────────────────────────────────────
export async function runBusinessIncomeTaxAudit(): Promise<{ period: string; assessed: number; totalTax: number; skipped: number }> {
  const now = new Date();
  const { period, periodStart, periodEnd } = priorMonthPeriod(now);

  // Idempotency: skip if we already ran this period.
  const lastPeriod = await getLastAuditPeriod();
  if (lastPeriod === period) {
    console.log(`[BusinessTax] Period ${period} already audited — skipping.`);
    return { period, assessed: 0, totalTax: 0, skipped: 0 };
  }

  console.log(`[BusinessTax] Starting income tax audit for period ${period} (${periodStart} → ${periodEnd})`);

  // Find all users who have a registered business (real or minx) with a userId.
  const businesses = await db
    .selectDistinct({ userId: worldBusinessesTable.userId })
    .from(worldBusinessesTable)
    .where(
      and(
        sql`${worldBusinessesTable.userId} IS NOT NULL`,
        inArray(worldBusinessesTable.businessType, ["real", "minx"])
      )
    );

  let assessed = 0;
  let totalTax = 0;
  let skipped = 0;

  for (const { userId } of businesses) {
    if (!userId) continue;
    try {
      const [revenue, expenses, cityId] = await Promise.all([
        getMonthlyRevenue(userId, periodStart, periodEnd),
        getMonthlyExpenses(userId, periodStart, periodEnd),
        resolvePlayerCity(userId),
      ]);

      const netProfit = revenue - expenses;
      if (netProfit <= 0) {
        skipped++;
        continue;
      }

      const taxAmount = Math.floor(netProfit * BUSINESS_TAX_RATE);
      if (taxAmount <= 0) {
        skipped++;
        continue;
      }

      // Insert tax record (idempotent via unique constraint).
      await db
        .insert(businessTaxPaymentsTable)
        .values({
          userId,
          cityId,
          period,
          netProfit: String(netProfit),
          taxAmount: String(taxAmount),
          status: "owed",
        })
        .onConflictDoNothing();

      // Attempt settlement: load (or create) player ledger and apply tax.
      const ledgerRows = await db
        .select()
        .from(playerLedgerTable)
        .where(eq(playerLedgerTable.userId, userId))
        .limit(1);
      let ledger = ledgerRows[0];
      if (!ledger) {
        const [created] = await db
          .insert(playerLedgerTable)
          .values({ userId })
          .returning();
        ledger = created;
      }

      // Tax is applied as additional in-game debt (Banco Ombra path).
      // The salaryman save-sync loop (syncDebtToLedger) reads taxDebt from the
      // save blob; here we instead write directly to the server-side debt ledger
      // so it's effective even without a concurrent save. On next save-read the
      // client will reflect the new in-game debt balance.
      await db
        .update(playerLedgerTable)
        .set({
          inGameDebt: sql`${playerLedgerTable.inGameDebt} + ${taxAmount}`,
          totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${taxAmount}`,
        })
        .where(eq(playerLedgerTable.userId, userId));

      // Mark as debt (Banco Ombra) since we can't directly deduct from the
      // ƒ wallet blob without a live save. The player will resolve it next session.
      await db
        .update(businessTaxPaymentsTable)
        .set({ status: "debt", settledAt: new Date() })
        .where(
          and(
            eq(businessTaxPaymentsTable.userId, userId),
            eq(businessTaxPaymentsTable.period, period)
          )
        );

      assessed++;
      totalTax += taxAmount;
      console.log(`[BusinessTax] ${userId} | city=${cityId} | profit=${netProfit} | tax=${taxAmount}`);
    } catch (err) {
      console.error(`[BusinessTax] Error auditing userId=${userId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Record that this period has been audited.
  await setLastAuditPeriod(period);
  console.log(`[BusinessTax] Audit complete: period=${period} assessed=${assessed} totalTax=${totalTax} skipped=${skipped}`);
  return { period, assessed, totalTax, skipped };
}

// ── shouldRunMonthlyTaxAudit ──────────────────────────────────────────────────
// Called by the scheduler. Returns true when the current month is a new month
// relative to the last recorded audit period. Safe to call on every hour tick.
export async function shouldRunMonthlyTaxAudit(): Promise<boolean> {
  const now = new Date();
  const { period } = priorMonthPeriod(now);
  const lastPeriod = await getLastAuditPeriod();
  return lastPeriod !== period;
}
