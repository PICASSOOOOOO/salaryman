// ─── Shared finance mutation services ────────────────────────────────────────
// Callable service functions for the money-touching enterprise-finance actions
// (paying a bill, running payroll). Both the manual /enterprise routes AND the
// Accounting autopilot handler call THESE — never a re-implemented copy — so the
// automatic and manual paths can never diverge and OFF == manual-only.
//
// Every mutation here records its balance-sheet transaction through the same
// shape the manual routes used, so the finance-engine books (cash flow, ledger,
// trial balance, aging) reconcile exactly as before. The work runs inside a
// single transaction with an advisory lock so a bill can never be paid (and its
// expense recorded) twice — the guarantee the autopilot relies on to never
// double-pay.

import {
  db,
  billsTable,
  payrollRunsTable,
  balanceSheetTxTable,
  type Bill,
  type PayrollRun,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type PayBillResult =
  | { ok: true; bill: Bill; amount: number }
  | { ok: false; reason: "not_found" | "already_paid" };

/**
 * Mark a single bill paid: flips status → "paid", stamps paidAt, and records the
 * matching balance-sheet "bill" transaction (the cash outflow the books read).
 *
 * Atomic + idempotent: an advisory lock keyed on (user, bill) serializes
 * concurrent attempts and the in-transaction status re-check makes a second call
 * a no-op, so the expense is recorded exactly once. This is the single source of
 * truth for "pay a bill" — the manual route and the autopilot both call it.
 */
export async function payBill(userId: string, billId: number): Promise<PayBillResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`bill_pay:${userId}:${billId}`}))`);

    const [existing] = await tx
      .select()
      .from(billsTable)
      .where(and(eq(billsTable.id, billId), eq(billsTable.userId, userId)));
    if (!existing) return { ok: false, reason: "not_found" as const };
    if (existing.status === "paid") return { ok: false, reason: "already_paid" as const };

    const [updated] = await tx
      .update(billsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(billsTable.id, billId), eq(billsTable.userId, userId)))
      .returning();

    // Clear any stale tx for this bill (mirrors the manual route) then record the
    // canonical outflow so we never double-count if a row somehow lingered.
    await tx
      .delete(balanceSheetTxTable)
      .where(
        and(
          eq(balanceSheetTxTable.userId, userId),
          eq(balanceSheetTxTable.referenceId, billId),
          eq(balanceSheetTxTable.referenceType, "bill")
        )
      );
    await tx.insert(balanceSheetTxTable).values({
      userId,
      type: "bill",
      category: updated.category,
      amount: String(updated.amount),
      description: `Bill paid: ${updated.vendor}${updated.description ? ` — ${updated.description}` : ""}`,
      referenceId: updated.id,
      referenceType: "bill",
      txDate: today(),
    });

    return { ok: true, bill: updated, amount: Number(updated.amount) || 0 };
  });
}

export interface CreatePayrollInput {
  payPeriodStart: string;
  payPeriodEnd: string;
  runDate?: string;
  breakdown: { amount?: number | string; [k: string]: unknown }[];
  notes?: string;
}

/**
 * Create a payroll run and record the matching balance-sheet "payroll"
 * transaction in one transaction. The total is derived from the breakdown the
 * same way the manual route did it, so the books reconcile identically. Single
 * source of truth for "run payroll" — manual route and autopilot both call it.
 */
export async function createPayrollRun(userId: string, input: CreatePayrollInput): Promise<PayrollRun> {
  const breakdown = Array.isArray(input.breakdown) ? input.breakdown : [];
  const totalAmount = breakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const runDate = input.runDate ? String(input.runDate) : today();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(payrollRunsTable)
      .values({
        userId,
        payPeriodStart: String(input.payPeriodStart),
        payPeriodEnd: String(input.payPeriodEnd),
        runDate,
        totalAmount: String(totalAmount),
        breakdown,
        notes: input.notes ? String(input.notes) : "",
      })
      .returning();

    await tx.insert(balanceSheetTxTable).values({
      userId,
      type: "payroll",
      category: "payroll",
      amount: String(totalAmount),
      description: `Payroll run: ${input.payPeriodStart} to ${input.payPeriodEnd}`,
      referenceId: row.id,
      referenceType: "payroll_run",
      txDate: row.runDate,
    });

    return row;
  });
}
