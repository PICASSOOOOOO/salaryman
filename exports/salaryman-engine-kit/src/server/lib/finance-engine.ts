// ─── Finance Engine ─────────────────────────────────────────────────────────
// Single source of truth for the company "books". Derives the standard
// accounting statements (cash flow, general ledger, trial balance, AR/AP
// aging) live from existing data — paid invoices = revenue,
// balance_sheet_transactions = cash outflows. No dedicated ledger table, so
// every consumer (the /enterprise/accounting route, Pablo's finance tool,
// dashboards) reuses THIS engine to stay reconciled.

import { db, balanceSheetTxTable, billsTable, invoicesTable, businessTaxPaymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function invoiceTotal(inv: { lineItems: unknown; taxRate: number | null }): number {
  const items = Array.isArray(inv.lineItems) ? (inv.lineItems as { quantity: number; rate: number }[]) : [];
  const sub = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
  const tax = sub * ((inv.taxRate || 0) / 100);
  return sub + tax;
}

export const ACCT = {
  cash: "1000 · Cash",
  revenue: "4000 · Sales Revenue",
  payroll: "5000 · Payroll Expense",
  bill: "5100 · Bills & Overhead",
  expense: "5200 · Operating Expenses",
} as const;

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

export interface CashFlowRow { month: string; inflow: number; payroll: number; bills: number; expenses: number; outflow: number; net: number; balance: number; }
export interface LedgerRow { date: string; refType: string; refId: number; memo: string; debit: number; credit: number; balance: number; }
export interface TrialRow { account: string; debit: number; credit: number; grossDebit: number; grossCredit: number; }
export interface AgingBuckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; }
export interface AgingItem { id: number; ref: string; party: string; dueDate: string; amount: number; daysOverdue: number; bucket: string; }
export interface TaxPaymentRow { id: number; period: string; cityId: string; netProfit: number; taxAmount: number; status: string; settledAt: string | null; createdAt: string; }
export interface AccountingReport {
  asOf: string;
  summary: {
    totalRevenue: number; totalPayroll: number; totalBills: number; totalExpenses: number;
    totalTaxPayments: number;
    netProfit: number; cashBalance: number; arOutstanding: number; apOutstanding: number;
  };
  cashFlow: CashFlowRow[];
  cashLedger: LedgerRow[];
  trialBalance: TrialRow[];
  trialBalanceTotals: { debit: number; credit: number };
  aging: {
    receivables: { buckets: AgingBuckets; items: AgingItem[] };
    payables: { buckets: AgingBuckets; items: AgingItem[] };
  };
  taxPayments: TaxPaymentRow[];
}

/**
 * Compute the full set of accounting statements for a user. This is THE
 * accounting engine — keep all amount/type guards identical across the journal,
 * cash-flow and aging passes so every statement reconciles.
 */
export async function getAccountingReport(userId: string): Promise<AccountingReport> {
  const [invoices, txRows, billRows, taxRows] = await Promise.all([
    db.select().from(invoicesTable).where(eq(invoicesTable.userId, userId)),
    db.select().from(balanceSheetTxTable).where(eq(balanceSheetTxTable.userId, userId)),
    db.select().from(billsTable).where(eq(billsTable.userId, userId)),
    db.select().from(businessTaxPaymentsTable).where(eq(businessTaxPaymentsTable.userId, userId)),
  ]);

  // ── Journal postings (double-entry) ──────────────────────────────────────
  type Posting = { date: string; refType: string; refId: number; memo: string; account: string; debit: number; credit: number };
  const postings: Posting[] = [];

  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const amt = invoiceTotal(inv);
    if (amt <= 0) continue;
    const date = inv.issueDate || today();
    const memo = `Invoice ${inv.invoiceNumber} — ${inv.clientName}`;
    postings.push({ date, refType: "invoice", refId: inv.id, memo, account: ACCT.cash, debit: amt, credit: 0 });
    postings.push({ date, refType: "invoice", refId: inv.id, memo, account: ACCT.revenue, debit: 0, credit: amt });
  }

  const outflowAccount = (type: string) =>
    type === "payroll" ? ACCT.payroll : type === "bill" ? ACCT.bill : ACCT.expense;

  for (const t of txRows) {
    if (t.type === "income") continue; // revenue handled via invoices
    const amt = Number(t.amount) || 0;
    if (amt <= 0) continue;
    const expenseAcct = outflowAccount(t.type);
    const memo = t.description || `${t.type} · ${t.category}`;
    postings.push({ date: t.txDate, refType: t.referenceType || t.type, refId: t.referenceId || t.id, memo, account: expenseAcct, debit: amt, credit: 0 });
    postings.push({ date: t.txDate, refType: t.referenceType || t.type, refId: t.referenceId || t.id, memo, account: ACCT.cash, debit: 0, credit: amt });
  }

  postings.sort((a, b) => (a.date === b.date ? a.refId - b.refId : a.date < b.date ? -1 : 1));

  // ── Trial balance (per-account net debit/credit) ─────────────────────────
  const accBalances = new Map<string, { debit: number; credit: number }>();
  for (const p of postings) {
    const cur = accBalances.get(p.account) || { debit: 0, credit: 0 };
    cur.debit += p.debit;
    cur.credit += p.credit;
    accBalances.set(p.account, cur);
  }
  const trialBalance = [...accBalances.entries()]
    .map(([account, v]) => {
      const net = v.debit - v.credit;
      return { account, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, grossDebit: v.debit, grossCredit: v.credit };
    })
    .sort((a, b) => (a.account < b.account ? -1 : 1));
  const tbTotals = trialBalance.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 });

  // ── General ledger (Cash account with running balance) ────────────────────
  let running = 0;
  const cashLedger = postings
    .filter((p) => p.account === ACCT.cash)
    .map((p) => {
      running += p.debit - p.credit;
      return { date: p.date, refType: p.refType, refId: p.refId, memo: p.memo, debit: p.debit, credit: p.credit, balance: running };
    });

  // ── Cash flow statement (monthly) ────────────────────────────────────────
  const months = new Map<string, { revenue: number; payroll: number; bills: number; expenses: number }>();
  const monthOf = (d: string) => (d && d.length >= 7 ? d.slice(0, 7) : today().slice(0, 7));
  const bumpMonth = (m: string, key: "revenue" | "payroll" | "bills" | "expenses", amt: number) => {
    const cur = months.get(m) || { revenue: 0, payroll: 0, bills: 0, expenses: 0 };
    cur[key] += amt;
    months.set(m, cur);
  };
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const amt = invoiceTotal(inv);
    if (amt <= 0) continue;
    bumpMonth(monthOf(inv.issueDate), "revenue", amt);
  }
  for (const t of txRows) {
    if (t.type === "income") continue;
    const amt = Number(t.amount) || 0;
    if (amt <= 0) continue;
    if (t.type === "payroll") bumpMonth(monthOf(t.txDate), "payroll", amt);
    else if (t.type === "bill") bumpMonth(monthOf(t.txDate), "bills", amt);
    else if (t.type === "expense") bumpMonth(monthOf(t.txDate), "expenses", amt);
  }
  let cashRun = 0;
  const cashFlow = [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => {
      const inflow = v.revenue;
      const outflow = v.payroll + v.bills + v.expenses;
      const net = inflow - outflow;
      cashRun += net;
      return { month, inflow, payroll: v.payroll, bills: v.bills, expenses: v.expenses, outflow, net, balance: cashRun };
    });

  // ── AR aging (unpaid invoices) & AP aging (unpaid bills) ─────────────────
  const todayMidnight = Date.parse(today());
  const daysPast = (dueDate: string) => {
    const due = Date.parse(dueDate || today());
    if (!isFinite(due)) return 0;
    return Math.floor((todayMidnight - due) / 86400000);
  };
  const emptyBuckets = (): AgingBuckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 });

  const arBuckets = emptyBuckets();
  const arItems: AgingItem[] = [];
  for (const inv of invoices) {
    if (!["draft", "sent", "overdue"].includes(inv.status)) continue;
    const amt = invoiceTotal(inv);
    if (amt <= 0) continue;
    const dOver = daysPast(inv.dueDate);
    const bucket = agingBucket(dOver);
    arBuckets[bucket as keyof AgingBuckets] += amt;
    arBuckets.total += amt;
    arItems.push({ id: inv.id, ref: inv.invoiceNumber, party: inv.clientName, dueDate: inv.dueDate, amount: amt, daysOverdue: Math.max(0, dOver), bucket });
  }
  arItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const apBuckets = emptyBuckets();
  const apItems: AgingItem[] = [];
  for (const b of billRows) {
    if (!["pending", "overdue"].includes(b.status)) continue;
    const amt = Number(b.amount) || 0;
    if (amt <= 0) continue;
    const dOver = daysPast(b.dueDate);
    const bucket = agingBucket(dOver);
    apBuckets[bucket as keyof AgingBuckets] += amt;
    apBuckets.total += amt;
    apItems.push({ id: b.id, ref: b.category, party: b.vendor, dueDate: b.dueDate, amount: amt, daysOverdue: Math.max(0, dOver), bucket });
  }
  apItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totalRevenue = trialBalance.find((r) => r.account === ACCT.revenue)?.credit ?? 0;
  const totalPayroll = accBalances.get(ACCT.payroll)?.debit ?? 0;
  const totalBills = accBalances.get(ACCT.bill)?.debit ?? 0;
  const totalExpenses = accBalances.get(ACCT.expense)?.debit ?? 0;

  // ── Business income tax payments ──────────────────────────────────────────
  const taxPayments: TaxPaymentRow[] = taxRows
    .slice()
    .sort((a, b) => (a.period < b.period ? 1 : -1))
    .map((t) => ({
      id: t.id,
      period: t.period,
      cityId: t.cityId,
      netProfit: Number(t.netProfit),
      taxAmount: Number(t.taxAmount),
      status: t.status,
      settledAt: t.settledAt ? t.settledAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    }));
  const totalTaxPayments = taxPayments.reduce((s, t) => s + t.taxAmount, 0);

  return {
    asOf: today(),
    summary: {
      totalRevenue,
      totalPayroll,
      totalBills,
      totalExpenses,
      totalTaxPayments,
      netProfit: totalRevenue - totalPayroll - totalBills - totalExpenses,
      cashBalance: cashRun,
      arOutstanding: arBuckets.total,
      apOutstanding: apBuckets.total,
    },
    cashFlow,
    cashLedger,
    trialBalance,
    trialBalanceTotals: tbTotals,
    aging: { receivables: { buckets: arBuckets, items: arItems }, payables: { buckets: apBuckets, items: apItems } },
    taxPayments,
  };
}

function money(v: number): string {
  const neg = v < 0;
  return `${neg ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Compact plain-text rendering of the books for the Pablo/Mila AI assistant to
 * reason over. Keeps it short — headline numbers, recent cash flow, and the
 * worst overdue receivables/payables.
 */
export function formatFinancialSummary(report: AccountingReport): string {
  const s = report.summary;
  const lines: string[] = [];
  lines.push(`BUSINESS FINANCIALS (as of ${report.asOf}):`);
  lines.push(`- Total revenue: ${money(s.totalRevenue)}`);
  lines.push(`- Net profit/(loss): ${money(s.netProfit)}`);
  lines.push(`- Cash balance: ${money(s.cashBalance)}`);
  lines.push(`- Costs — payroll ${money(s.totalPayroll)}, bills ${money(s.totalBills)}, expenses ${money(s.totalExpenses)}`);
  lines.push(`- Accounts receivable outstanding (owed to you): ${money(s.arOutstanding)}`);
  lines.push(`- Accounts payable outstanding (you owe): ${money(s.apOutstanding)}`);

  const recent = report.cashFlow.slice(-3);
  if (recent.length) {
    lines.push("Recent monthly cash flow:");
    for (const m of recent) {
      lines.push(`  ${m.month}: in ${money(m.inflow)}, out ${money(m.outflow)}, net ${money(m.net)} (cash ${money(m.balance)})`);
    }
  }

  const overdueAr = report.aging.receivables.items.filter((i) => i.daysOverdue > 0).slice(0, 3);
  if (overdueAr.length) {
    lines.push("Overdue invoices (collect these):");
    for (const i of overdueAr) lines.push(`  ${i.party} — ${money(i.amount)}, ${i.daysOverdue}d overdue`);
  }
  const overdueAp = report.aging.payables.items.filter((i) => i.daysOverdue > 0).slice(0, 3);
  if (overdueAp.length) {
    lines.push("Overdue bills (pay these):");
    for (const i of overdueAp) lines.push(`  ${i.party} — ${money(i.amount)}, ${i.daysOverdue}d overdue`);
  }

  const tbBalanced = Math.abs(report.trialBalanceTotals.debit - report.trialBalanceTotals.credit) < 0.01;
  lines.push(`Trial balance is ${tbBalanced ? "in balance" : "OUT OF BALANCE"}.`);
  return lines.join("\n");
}
