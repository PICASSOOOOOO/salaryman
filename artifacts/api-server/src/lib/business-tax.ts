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
  invoicesTable,
  type BusinessTaxStatus,
} from "@workspace/db";
import { eq, and, sql, inArray, asc, gte, lt } from "drizzle-orm";

const BUSINESS_TAX_RATE = 0.5;

// System-config key to persist the last audit month so a restart doesn't
// re-run the same month twice. We store it in world_kv.
const TAX_AUDIT_KV_KEY = "business_tax_last_audit_period";

// ── Revenue / expense queries ─────────────────────────────────────────────────
// Revenue = sum of paid invoices in the target month.
// Expenses = sum of balance_sheet_transactions (expense / bill / payroll) in
// the target month. Uses the same guards as the finance-engine reconcile audit.
async function getMonthlyRevenue(userId: string, periodStart: string, periodEnd: string): Promise<number> {
  // `invoices` is the document-ledger table. It stores line items and tax rate
  // rather than a duplicated total_amount column; updated_at is the canonical
  // settlement timestamp because the paid transition updates the row.
  const rows = await db
    .select({ lineItems: invoicesTable.lineItems, taxRate: invoicesTable.taxRate })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.userId, userId),
      eq(invoicesTable.status, "paid"),
      gte(invoicesTable.updatedAt, new Date(periodStart)),
      lt(invoicesTable.updatedAt, new Date(periodEnd)),
    ));
  return rows.reduce((sum, invoice) => {
    const items = Array.isArray(invoice.lineItems)
      ? invoice.lineItems as Array<{ quantity?: unknown; rate?: unknown }>
      : [];
    const subtotal = items.reduce((itemSum, item) => {
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);
      if (!Number.isFinite(quantity) || !Number.isFinite(rate) || quantity <= 0 || rate < 0) return itemSum;
      return itemSum + quantity * rate;
    }, 0);
    const taxRate = Number(invoice.taxRate);
    const total = subtotal * (1 + (Number.isFinite(taxRate) ? Math.max(0, taxRate) : 0) / 100);
    return sum + Math.round(total);
  }, 0);
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
export function businessTaxPeriodKey(period: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Invalid business tax period: ${period}`);
  return Number(`${match[1]}${match[2]}`);
}

async function getLastAuditPeriod(): Promise<number | null> {
  const rows = await db.execute<{ value: number }>(
    sql`SELECT value FROM world_kv WHERE key = ${TAX_AUDIT_KV_KEY} LIMIT 1`
  );
  const value = Number(rows.rows[0]?.value);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function setLastAuditPeriod(period: string): Promise<void> {
  const periodKey = businessTaxPeriodKey(period);
  await db.execute(
    sql`
      INSERT INTO world_kv (key, value, updated_at)
      VALUES (${TAX_AUDIT_KV_KEY}, ${periodKey}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${periodKey}, updated_at = now()
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
  if (lastPeriod === businessTaxPeriodKey(period)) {
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

      // Insert tax record as "owed" (idempotent via unique constraint).
      // Real-time settlement happens in flushPendingBusinessTax on the next
      // PUT /salaryman/saves/:slot, where we have the live salary blob.
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
  return lastPeriod !== businessTaxPeriodKey(period);
}

// ── flushPendingBusinessTax ───────────────────────────────────────────────────
// Called from the PUT /salaryman/saves/:slot handler after the save blob has
// been loaded/merged (incoming). Attempts to settle any "owed" business-tax
// payments directly against the player's live ƒ salary:
//
//   salary >= tax  →  deduct full amount from salary blob, status = "paid"
//   salary < tax   →  deduct available fiat, remainder → inGameDebt, status = "debt"
//
// Mutates `incoming.salary` in-place so the updated balance is persisted in the
// same save write that triggered this flush. Never throws — best-effort only.
export async function flushPendingBusinessTax(
  userId: string,
  incoming: Record<string, unknown>
): Promise<void> {
  // Collect all "owed" payments for this user oldest-first (deterministic order
  // so multiple periods always settle in chronological sequence).
  const pending = await db
    .select({
      id: businessTaxPaymentsTable.id,
      taxAmount: businessTaxPaymentsTable.taxAmount,
    })
    .from(businessTaxPaymentsTable)
    .where(
      and(
        eq(businessTaxPaymentsTable.userId, userId),
        eq(businessTaxPaymentsTable.status, "owed")
      )
    )
    .orderBy(asc(businessTaxPaymentsTable.id));

  if (pending.length === 0) return;

  // Derive current salary from the incoming blob. The top-level `salary` key
  // mirrors the column value the client is about to persist.
  let salary = typeof incoming.salary === "number" ? incoming.salary : 0;

  for (const row of pending) {
    const tax = Math.floor(Number(row.taxAmount));

    // Atomic claim: flip status away from "owed" only if it hasn't already
    // been claimed by a concurrent save. The WHERE status='owed' guard ensures
    // exactly-once processing even under concurrent PUT saves for the same user.
    const targetStatus: BusinessTaxStatus = tax <= 0 ? "paid" : salary >= tax ? "paid" : "debt";
    const claimed = await db
      .update(businessTaxPaymentsTable)
      .set({ status: targetStatus, settledAt: new Date() })
      .where(
        and(
          eq(businessTaxPaymentsTable.id, row.id),
          eq(businessTaxPaymentsTable.status, "owed")
        )
      )
      .returning({ id: businessTaxPaymentsTable.id });

    // If no row was returned the payment was already claimed by a concurrent
    // request — skip to avoid double-deducting salary or double-writing debt.
    if (claimed.length === 0) continue;

    if (tax <= 0) {
      // Zero-tax no-op — already marked paid above, nothing to deduct.
      continue;
    }

    if (salary >= tax) {
      // Full settlement: deduct from the salary blob. No debt written.
      salary -= tax;
      console.log(`[BusinessTax] flush paid: userId=${userId} tax=${tax}`);
    } else {
      // Partial settlement: drain salary to 0, write remainder as debt.
      const paid = salary;
      const remainder = tax - paid;
      salary = 0;

      // Ensure ledger row exists before incrementing debt.
      await db.insert(playerLedgerTable).values({ userId }).onConflictDoNothing();
      await db
        .update(playerLedgerTable)
        .set({
          inGameDebt: sql`${playerLedgerTable.inGameDebt} + ${remainder}`,
          totalDebtAccrued: sql`${playerLedgerTable.totalDebtAccrued} + ${remainder}`,
        })
        .where(eq(playerLedgerTable.userId, userId));
      console.log(`[BusinessTax] flush partial: userId=${userId} paid=${paid} debt=${remainder}`);
    }
  }

  // Write the updated salary back into the blob so it's persisted in the save.
  incoming.salary = salary;
}
