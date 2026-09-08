// ─── Accounting Autopilot handler ────────────────────────────────────────────
// The assigned bot acts as a virtual CFO for the org's books (the org OWNER's
// finance data — the same account the manual Enterprise Finance screens read and
// write). Each due tick it:
//   1. Collections — chases overdue receivables, logging a (cooldown-deduped)
//      reminder per overdue invoice from the existing aging data.
//   2. Bill payment — pays due bills (oldest first) through the shared payBill
//      service ONLY while book cash covers them, so it can never overdraw.
//   3. Payroll — runs payroll once per pay period for active employees with a
//      pay rate, cash-gated, through the shared createPayrollRun service.
//
// Everything routes through finance-engine (reads) and finance-actions (writes)
// — the SAME services the manual UI uses — so OFF == manual-only with zero data
// divergence. Manual Enterprise Finance requires only auth (no PRIME / no paid
// AI), so this handler deliberately uses NO entitlement/credit gate; gating it
// would make the automatic path stricter than the manual one.

import { db, billsTable, realEmployeesTable, payrollRunsTable } from "@workspace/db";
import { and, eq, inArray, lte, asc, desc, gt } from "drizzle-orm";
import { getAccountingReport, type AccountingReport } from "../../finance-engine";
import { payBill, createPayrollRun } from "../../finance-actions";
import { getRecentAutopilotActivity } from "../activity";
import { readAccountingPrefs } from "../accounting-prefs";
import type { AutopilotContext, AutopilotHandler } from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export const accountingAutopilotHandler: AutopilotHandler = async (ctx) => {
  const userId = ctx.ownerId;
  if (!userId) {
    await ctx.log({ action: "tick", summary: "No org owner resolved; nothing to do.", outcome: "noop" });
    return;
  }

  let report: AccountingReport;
  try {
    report = await getAccountingReport(userId);
  } catch (err) {
    await ctx.log({
      action: "tick",
      summary: "Could not load the books this tick; will retry next cycle.",
      outcome: "error",
      detail: { error: String((err as Error)?.message ?? err) },
    });
    return;
  }

  // Owner-tunable preferences (which duties run, reminder cooldown, payroll
  // cadence). An org that never set any gets all three duties on the prior
  // defaults (3-day reminder cooldown, 28-day payroll period).
  const prefs = readAccountingPrefs(ctx.config.prefs);

  let availableCash = report.summary.cashBalance;
  let acted = false;

  if (prefs.collections) {
    acted = (await runCollections(ctx, report, prefs.reminderCooldownDays)) || acted;
  }

  if (prefs.billPayments) {
    const billRun = await runBillPayments(ctx, userId, availableCash);
    availableCash = billRun.cash;
    acted = billRun.acted || acted;
  }

  if (prefs.payroll) {
    acted = (await runPayroll(ctx, userId, availableCash, prefs.payrollPeriodDays)) || acted;
  }

  if (!acted) {
    await ctx.log({
      action: "tick",
      summary: "Books reviewed — nothing due (no overdue invoices, bills, or payroll).",
      outcome: "noop",
    });
  }
};

// ── 1. Collections ───────────────────────────────────────────────────────────
async function runCollections(
  ctx: AutopilotContext,
  report: AccountingReport,
  reminderCooldownDays: number
): Promise<boolean> {
  const overdue = report.aging.receivables.items.filter((i) => i.daysOverdue > 0);
  if (overdue.length === 0) return false;

  // Recent reminders, to dedupe within the cooldown window.
  const recent = await getRecentAutopilotActivity(ctx.orgId, { domain: "accounting", limit: 200 });
  const cutoff = Date.now() - reminderCooldownDays * 86_400_000;
  const remindedRecently = new Set<number>();
  for (const row of recent) {
    if (row.action !== "collections_reminder") continue;
    if (new Date(row.createdAt).getTime() < cutoff) continue;
    const invId = (row.detail as { invoiceId?: number } | null)?.invoiceId;
    if (typeof invId === "number") remindedRecently.add(invId);
  }

  let acted = false;
  for (const inv of overdue) {
    if (remindedRecently.has(inv.id)) continue;
    if (!ctx.claimAction()) return acted; // per-tick cap hit
    await ctx.log({
      action: "collections_reminder",
      summary: `Chased overdue invoice ${inv.ref || `#${inv.id}`} — ${inv.party || "client"} owes ${money(inv.amount)} (${inv.daysOverdue}d overdue).`,
      outcome: "success",
      detail: { invoiceId: inv.id, ref: inv.ref, party: inv.party, amount: inv.amount, daysOverdue: inv.daysOverdue },
    });
    acted = true;
  }
  return acted;
}

// ── 2. Bill payment ──────────────────────────────────────────────────────────
async function runBillPayments(
  ctx: AutopilotContext,
  userId: string,
  startingCash: number
): Promise<{ cash: number; acted: boolean }> {
  const due = await db
    .select()
    .from(billsTable)
    .where(
      and(
        eq(billsTable.userId, userId),
        inArray(billsTable.status, ["pending", "overdue"]),
        lte(billsTable.dueDate, today())
      )
    )
    .orderBy(asc(billsTable.dueDate));

  let cash = startingCash;
  let acted = false;
  let skippedForCash = 0;
  let skippedTotal = 0;

  for (const bill of due) {
    const amount = Number(bill.amount) || 0;
    if (amount > cash) {
      skippedForCash += 1;
      skippedTotal += amount;
      continue; // a cheaper later bill may still be payable
    }
    if (!ctx.claimAction()) break; // per-tick cap hit

    const result = await payBill(userId, bill.id);
    if (!result.ok) {
      // already paid / vanished between read and write — not an error, just skip.
      continue;
    }
    cash -= result.amount;
    acted = true;
    await ctx.log({
      action: "pay_bill",
      summary: `Paid bill to ${bill.vendor} — ${money(result.amount)} (due ${bill.dueDate}). Cash left: ${money(cash)}.`,
      outcome: "success",
      detail: { billId: bill.id, vendor: bill.vendor, amount: result.amount, dueDate: bill.dueDate, cashAfter: cash },
    });
  }

  if (skippedForCash > 0) {
    await ctx.log({
      action: "pay_bill",
      summary: `Held ${skippedForCash} due bill(s) totalling ${money(skippedTotal)} — not enough cash (${money(cash)} available).`,
      outcome: "skipped",
      detail: { skipped: skippedForCash, skippedTotal, cashAvailable: cash },
    });
  }

  return { cash, acted };
}

// ── 3. Payroll ───────────────────────────────────────────────────────────────
async function runPayroll(
  ctx: AutopilotContext,
  userId: string,
  cash: number,
  payrollPeriodDays: number
): Promise<boolean> {
  // Active employees with a positive pay rate.
  const employees = await db
    .select()
    .from(realEmployeesTable)
    .where(and(eq(realEmployeesTable.userId, userId), eq(realEmployeesTable.status, "active"), gt(realEmployeesTable.payRate, "0")));
  if (employees.length === 0) return false;

  // Has a payroll run happened within the current pay period?
  const [lastRun] = await db
    .select()
    .from(payrollRunsTable)
    .where(eq(payrollRunsTable.userId, userId))
    .orderBy(desc(payrollRunsTable.runDate))
    .limit(1);

  const now = new Date();
  if (lastRun) {
    const last = new Date(`${lastRun.runDate}T00:00:00Z`);
    if (!isNaN(last.getTime()) && daysBetween(now, last) < payrollPeriodDays) {
      return false; // already paid this period
    }
  }

  const total = employees.reduce((sum, e) => sum + (Number(e.payRate) || 0), 0);
  if (total <= 0) return false;

  if (total > cash) {
    await ctx.log({
      action: "run_payroll",
      summary: `Payroll of ${money(total)} for ${employees.length} employee(s) is due but cash (${money(cash)}) won't cover it — held.`,
      outcome: "skipped",
      detail: { total, headcount: employees.length, cashAvailable: cash },
    });
    return false;
  }

  if (!ctx.claimAction()) return false; // per-tick cap hit

  const periodEnd = today();
  const periodStartDate = lastRun
    ? new Date(new Date(`${lastRun.runDate}T00:00:00Z`).getTime() + 86_400_000)
    : new Date(now.getTime() - payrollPeriodDays * 86_400_000);
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  const breakdown = employees.map((e) => ({
    employeeId: e.id,
    name: e.name,
    role: e.role,
    amount: Number(e.payRate) || 0,
  }));

  const run = await createPayrollRun(userId, {
    payPeriodStart: periodStart,
    payPeriodEnd: periodEnd,
    breakdown,
    notes: "Autopilot payroll run",
  });

  await ctx.log({
    action: "run_payroll",
    summary: `Ran payroll for ${employees.length} employee(s) — ${money(total)} (${periodStart} to ${periodEnd}).`,
    outcome: "success",
    detail: { payrollRunId: run.id, total, headcount: employees.length, payPeriodStart: periodStart, payPeriodEnd: periodEnd },
  });
  return true;
}

function money(n: number): string {
  return `ƒ${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
