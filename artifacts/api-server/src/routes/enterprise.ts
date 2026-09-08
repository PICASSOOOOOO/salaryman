import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  realEmployeesTable,
  payrollRunsTable,
  billsTable,
  businessExpensesTable,
  balanceSheetTxTable,
  invoicesTable,
  businessTaxPaymentsTable,
  platformConnectedAppsTable,
} from "@workspace/db";
import { eq, and, sql, desc, gte, lte, inArray } from "drizzle-orm";
import { getAccountingReport } from "../lib/finance-engine";
import { payBill, createPayrollRun } from "../lib/finance-actions";
import { computeTaxEstimate, buildScheduleC, type FilingStatus, type ScheduleCExpenseItem, type TaxEstimate, type TaxOverrides } from "../lib/tax-engine";
import { resolveCurrentOrgId, canDoInOrg, getActiveOrgMemberIds, type OrgPermissionCheck } from "../lib/org-permissions";
import type { OrgPermissionKey } from "@workspace/db";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function requireTaxProviderConnection(req: Request, res: Response): Promise<boolean> {
  const userId = req.user!.id;
  const orgId = String((req as Request & { orgId?: string }).orgId ?? userId);
  const [connection] = await db
    .select({ id: platformConnectedAppsTable.id, config: platformConnectedAppsTable.config })
    .from(platformConnectedAppsTable)
    .where(and(
      eq(platformConnectedAppsTable.orgId, orgId),
      eq(platformConnectedAppsTable.appSlug, "tax-provider"),
      eq(platformConnectedAppsTable.status, "connected"),
    ))
    .limit(1);
  const config = connection?.config && typeof connection.config === "object"
    ? connection.config as Record<string, unknown>
    : {};
  const credentials = config.credentials && typeof config.credentials === "object"
    ? config.credentials as Record<string, unknown>
    : {};
  const hasProviderCredential = ["apiKey", "login"].some((key) =>
    typeof credentials[key] === "string" && credentials[key].trim().length > 0
  );
  if (connection && hasProviderCredential) return true;
  res.status(428).json({
    error: "Connect your tax provider before using tax tools.",
    code: "tax_provider_connection_required",
    connect: "/profile?section=platform",
  });
  return false;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const VALID_PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "annually", "contract"] as const;
const VALID_EMP_STATUSES = ["active", "on leave", "inactive", "terminated"] as const;
const VALID_BILL_CATEGORIES = ["rent", "utilities", "subscriptions", "insurance", "vendor", "marketing", "equipment", "legal", "tax", "payable", "other"] as const;
const VALID_BILL_RECURRENCES = ["one-time", "weekly", "biweekly", "monthly", "quarterly", "annually"] as const;
const VALID_BILL_STATUSES = ["pending", "paid", "overdue"] as const;
const VALID_EXPENSE_CATEGORIES = ["supplies", "travel", "marketing", "equipment", "software", "meals", "utilities", "professional_services", "training", "office", "payable", "other"] as const;

function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function parsePositiveAmount(v: unknown): number | null {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return null;
  return n;
}

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

async function recordTx(
  userId: string,
  type: "income" | "payroll" | "bill" | "expense",
  category: string,
  amount: number | string,
  description: string,
  referenceId: number,
  referenceType: string,
  txDate: string
) {
  await db.insert(balanceSheetTxTable).values({
    userId,
    type,
    category,
    amount: String(amount),
    description,
    referenceId,
    referenceType,
    txDate,
  });
}

async function deleteTx(userId: string, referenceId: number, referenceType: string) {
  await db
    .delete(balanceSheetTxTable)
    .where(
      and(
        eq(balanceSheetTxTable.userId, userId),
        eq(balanceSheetTxTable.referenceId, referenceId),
        eq(balanceSheetTxTable.referenceType, referenceType)
      )
    );
}

// ─── Employees ────────────────────────────────────────────────────────────────

router.get("/enterprise/employees", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const rows = await db
    .select()
    .from(realEmployeesTable)
    .where(eq(realEmployeesTable.userId, req.user!.id))
    .orderBy(desc(realEmployeesTable.createdAt));
  res.json({ employees: rows });
});

router.post("/enterprise/employees", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { name, role, payRate, payFrequency, status, notes } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const parsedRate = parsePositiveAmount(payRate);
  if (payRate !== undefined && parsedRate === null) {
    res.status(400).json({ error: "payRate must be a non-negative number" });
    return;
  }
  if (payFrequency && !isOneOf(payFrequency, VALID_PAY_FREQUENCIES)) {
    res.status(400).json({ error: `payFrequency must be one of: ${VALID_PAY_FREQUENCIES.join(", ")}` });
    return;
  }
  if (status && !isOneOf(status, VALID_EMP_STATUSES)) {
    res.status(400).json({ error: `status must be one of: ${VALID_EMP_STATUSES.join(", ")}` });
    return;
  }
  const [row] = await db
    .insert(realEmployeesTable)
    .values({
      userId,
      name: String(name).trim(),
      role: role ? String(role).trim() : "",
      payRate: String(parsedRate ?? 0),
      payFrequency: payFrequency ?? "monthly",
      status: status ?? "active",
      notes: notes ? String(notes) : "",
    })
    .returning();
  res.json({ employee: row });
});

router.put("/enterprise/employees/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { name, role, payRate, payFrequency, status, notes } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name) updates.name = String(name).trim();
  if (role !== undefined) updates.role = String(role).trim();
  if (payRate !== undefined) {
    const parsed = parsePositiveAmount(payRate);
    if (parsed === null) { res.status(400).json({ error: "payRate must be a non-negative number" }); return; }
    updates.payRate = String(parsed);
  }
  if (payFrequency) {
    if (!isOneOf(payFrequency, VALID_PAY_FREQUENCIES)) { res.status(400).json({ error: "Invalid payFrequency" }); return; }
    updates.payFrequency = payFrequency;
  }
  if (status) {
    if (!isOneOf(status, VALID_EMP_STATUSES)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.status = status;
  }
  if (notes !== undefined) updates.notes = String(notes);

  const [row] = await db
    .update(realEmployeesTable)
    .set(updates)
    .where(and(eq(realEmployeesTable.id, id), eq(realEmployeesTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ employee: row });
});

router.delete("/enterprise/employees/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db
    .delete(realEmployeesTable)
    .where(and(eq(realEmployeesTable.id, id), eq(realEmployeesTable.userId, userId)));
  res.json({ ok: true });
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

router.get("/enterprise/payroll", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const rows = await db
    .select()
    .from(payrollRunsTable)
    .where(eq(payrollRunsTable.userId, req.user!.id))
    .orderBy(desc(payrollRunsTable.createdAt));
  res.json({ payrollRuns: rows });
});

router.post("/enterprise/payroll", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { payPeriodStart, payPeriodEnd, runDate, breakdown, notes } = req.body ?? {};

  if (!isValidDate(payPeriodStart) || !isValidDate(payPeriodEnd)) {
    res.status(400).json({ error: "payPeriodStart and payPeriodEnd must be valid YYYY-MM-DD dates" });
    return;
  }
  if (runDate && !isValidDate(runDate)) {
    res.status(400).json({ error: "runDate must be a valid YYYY-MM-DD date" });
    return;
  }

  const breakdownArr = Array.isArray(breakdown) ? breakdown : [];
  for (const item of breakdownArr) {
    const amt = parsePositiveAmount(item?.amount);
    if (amt === null) { res.status(400).json({ error: "Each breakdown item must have a non-negative amount" }); return; }
  }
  const row = await createPayrollRun(userId, {
    payPeriodStart: String(payPeriodStart),
    payPeriodEnd: String(payPeriodEnd),
    runDate: runDate ? String(runDate) : undefined,
    breakdown: breakdownArr,
    notes: notes ? String(notes) : "",
  });

  res.json({ payrollRun: row });
});

router.delete("/enterprise/payroll/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await deleteTx(userId, id, "payroll_run");
  await db.delete(payrollRunsTable).where(and(eq(payrollRunsTable.id, id), eq(payrollRunsTable.userId, userId)));
  res.json({ ok: true });
});

// ─── Bills ────────────────────────────────────────────────────────────────────

router.get("/enterprise/bills", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { status } = req.query;
  const rows = await db
    .select()
    .from(billsTable)
    .where(
      status && status !== "all"
        ? and(eq(billsTable.userId, req.user!.id), eq(billsTable.status, String(status)))
        : eq(billsTable.userId, req.user!.id)
    )
    .orderBy(desc(billsTable.createdAt));
  res.json({ bills: rows });
});

router.post("/enterprise/bills", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { vendor, description, amount, dueDate, category, recurrence, status, proofPath } = req.body ?? {};
  if (!vendor || typeof vendor !== "string" || !vendor.trim()) {
    res.status(400).json({ error: "vendor required" });
    return;
  }
  if (!isValidDate(dueDate)) {
    res.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD date" });
    return;
  }
  const parsedAmount = parsePositiveAmount(amount);
  if (amount !== undefined && parsedAmount === null) {
    res.status(400).json({ error: "amount must be a non-negative number" });
    return;
  }
  if (category && !isOneOf(category, VALID_BILL_CATEGORIES)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  if (recurrence && !isOneOf(recurrence, VALID_BILL_RECURRENCES)) {
    res.status(400).json({ error: "Invalid recurrence" });
    return;
  }
  if (status && !isOneOf(status, VALID_BILL_STATUSES)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [row] = await db
    .insert(billsTable)
    .values({
      userId,
      vendor: String(vendor).trim(),
      description: description ? String(description) : "",
      amount: String(parsedAmount ?? 0),
      dueDate: String(dueDate),
      category: category ?? "other",
      recurrence: recurrence ?? "one-time",
      status: status ?? "pending",
      proofPath: proofPath ? String(proofPath) : null,
    })
    .returning();
  res.json({ bill: row });
});

router.put("/enterprise/bills/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { vendor, description, amount, dueDate, category, recurrence, status, proofPath } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (vendor) updates.vendor = String(vendor).trim();
  if (description !== undefined) updates.description = String(description);
  if (amount !== undefined) {
    const parsed = parsePositiveAmount(amount);
    if (parsed === null) { res.status(400).json({ error: "amount must be a non-negative number" }); return; }
    updates.amount = String(parsed);
  }
  if (dueDate) {
    if (!isValidDate(dueDate)) { res.status(400).json({ error: "Invalid dueDate" }); return; }
    updates.dueDate = String(dueDate);
  }
  if (category) {
    if (!isOneOf(category, VALID_BILL_CATEGORIES)) { res.status(400).json({ error: "Invalid category" }); return; }
    updates.category = category;
  }
  if (recurrence) {
    if (!isOneOf(recurrence, VALID_BILL_RECURRENCES)) { res.status(400).json({ error: "Invalid recurrence" }); return; }
    updates.recurrence = recurrence;
  }
  if (proofPath !== undefined) updates.proofPath = proofPath ? String(proofPath) : null;

  const isPaying = status === "paid";
  // The "paid" transition (status + paidAt + the recorded outflow) is owned by
  // the shared payBill service so the manual route and the autopilot record the
  // expense identically and atomically. Only non-paid status changes are applied
  // inline here.
  if (status && !isPaying) {
    if (!isOneOf(status, VALID_BILL_STATUSES)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.status = status;
  }

  let row;
  if (Object.keys(updates).length > 0) {
    [row] = await db
      .update(billsTable)
      .set(updates)
      .where(and(eq(billsTable.id, id), eq(billsTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
  }

  if (isPaying) {
    const result = await payBill(userId, id);
    if (!result.ok) {
      if (result.reason === "not_found") { res.status(404).json({ error: "Not found" }); return; }
      // already_paid — surface the current row without double-recording.
      const [current] = await db
        .select()
        .from(billsTable)
        .where(and(eq(billsTable.id, id), eq(billsTable.userId, userId)));
      res.json({ bill: current });
      return;
    }
    row = result.bill;
  }

  if (!row) {
    const [current] = await db
      .select()
      .from(billsTable)
      .where(and(eq(billsTable.id, id), eq(billsTable.userId, userId)));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    row = current;
  }

  res.json({ bill: row });
});

router.delete("/enterprise/bills/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await deleteTx(userId, id, "bill");
  await db.delete(billsTable).where(and(eq(billsTable.id, id), eq(billsTable.userId, userId)));
  res.json({ ok: true });
});

// ─── Business Expenses ────────────────────────────────────────────────────────

router.get("/enterprise/expenses", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { category } = req.query;
  const rows = await db
    .select()
    .from(businessExpensesTable)
    .where(
      category && category !== "all"
        ? and(eq(businessExpensesTable.userId, req.user!.id), eq(businessExpensesTable.category, String(category)))
        : eq(businessExpensesTable.userId, req.user!.id)
    )
    .orderBy(desc(businessExpensesTable.createdAt));
  res.json({ expenses: rows });
});

router.post("/enterprise/expenses", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { category, amount, expenseDate, description, receiptPath, notes } = req.body ?? {};
  if (!isValidDate(expenseDate)) {
    res.status(400).json({ error: "expenseDate must be a valid YYYY-MM-DD date" });
    return;
  }
  const parsedAmount = parsePositiveAmount(amount);
  if (amount !== undefined && parsedAmount === null) {
    res.status(400).json({ error: "amount must be a non-negative number" });
    return;
  }
  if (category && !isOneOf(category, VALID_EXPENSE_CATEGORIES)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const [row] = await db
    .insert(businessExpensesTable)
    .values({
      userId,
      category: category ?? "other",
      amount: String(parsedAmount ?? 0),
      expenseDate: String(expenseDate),
      description: description ? String(description) : "",
      receiptPath: receiptPath ? String(receiptPath) : null,
      notes: notes ? String(notes) : "",
    })
    .returning();

  await recordTx(
    userId,
    "expense",
    row.category,
    Number(row.amount),
    `Expense: ${row.description || row.category}`,
    row.id,
    "expense",
    row.expenseDate
  );

  res.json({ expense: row });
});

router.put("/enterprise/expenses/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { category, amount, expenseDate, description, receiptPath, notes } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (category) {
    if (!isOneOf(category, VALID_EXPENSE_CATEGORIES)) { res.status(400).json({ error: "Invalid category" }); return; }
    updates.category = category;
  }
  if (amount !== undefined) {
    const parsed = parsePositiveAmount(amount);
    if (parsed === null) { res.status(400).json({ error: "amount must be a non-negative number" }); return; }
    updates.amount = String(parsed);
  }
  if (expenseDate) {
    if (!isValidDate(expenseDate)) { res.status(400).json({ error: "Invalid expenseDate" }); return; }
    updates.expenseDate = String(expenseDate);
  }
  if (description !== undefined) updates.description = String(description);
  if (receiptPath !== undefined) updates.receiptPath = receiptPath ? String(receiptPath) : null;
  if (notes !== undefined) updates.notes = String(notes);

  const [row] = await db
    .update(businessExpensesTable)
    .set(updates)
    .where(and(eq(businessExpensesTable.id, id), eq(businessExpensesTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  await deleteTx(userId, id, "expense");
  await recordTx(
    userId,
    "expense",
    row.category,
    Number(row.amount),
    `Expense: ${row.description || row.category}`,
    row.id,
    "expense",
    row.expenseDate
  );

  res.json({ expense: row });
});

router.delete("/enterprise/expenses/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await deleteTx(userId, id, "expense");
  await db.delete(businessExpensesTable).where(and(eq(businessExpensesTable.id, id), eq(businessExpensesTable.userId, userId)));
  res.json({ ok: true });
});

// ─── Balance Sheet ────────────────────────────────────────────────────────────

router.get("/enterprise/balance-sheet", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [txRows, paidInvoices, taxPaymentRows] = await Promise.all([
    db.select().from(balanceSheetTxTable)
      .where(eq(balanceSheetTxTable.userId, userId))
      .orderBy(desc(balanceSheetTxTable.txDate), desc(balanceSheetTxTable.createdAt)),
    db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.status, "paid"))),
    db.select().from(businessTaxPaymentsTable)
      .where(eq(businessTaxPaymentsTable.userId, userId))
      .orderBy(desc(businessTaxPaymentsTable.period)),
  ]);

  const grossInvoiceIncome = paidInvoices.reduce((sum, inv) => {
    const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
    const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
    const tax = sub * ((inv.taxRate || 0) / 100);
    return sum + sub + tax;
  }, 0);

  const payrollTotal = txRows.filter(t => t.type === "payroll").reduce((s, t) => s + Number(t.amount), 0);
  const billsTotal = txRows.filter(t => t.type === "bill").reduce((s, t) => s + Number(t.amount), 0);
  const expensesTotal = txRows.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const taxTotal = taxPaymentRows.reduce((s, t) => s + Number(t.taxAmount), 0);
  const totalOutgoings = payrollTotal + billsTotal + expensesTotal + taxTotal;
  const netProfit = grossInvoiceIncome - totalOutgoings;

  const categoryBreakdown = txRows.reduce<Record<string, number>>((acc, t) => {
    const key = `${t.type}:${t.category}`;
    acc[key] = (acc[key] || 0) + Number(t.amount);
    return acc;
  }, {});

  res.json({
    summary: {
      grossInvoiceIncome,
      payrollTotal,
      billsTotal,
      expensesTotal,
      taxTotal,
      totalOutgoings,
      netProfit,
    },
    categoryBreakdown,
    ledger: txRows,
    taxPayments: taxPaymentRows.map(t => ({
      id: t.id,
      period: t.period,
      cityId: t.cityId,
      netProfit: Number(t.netProfit),
      taxAmount: Number(t.taxAmount),
      status: t.status,
      label: `City Business Tax (${t.period})`,
      settledAt: t.settledAt ? t.settledAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    })),
    invoices: paidInvoices.map(inv => {
      const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
      const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
      const tax = sub * ((inv.taxRate || 0) / 100);
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName,
        amount: sub + tax,
        issueDate: inv.issueDate,
      };
    }),
  });
});

router.get("/enterprise/balance-sheet/ledger", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;
  const { type, limit: limitParam } = req.query;
  const lim = Math.min(parseInt(String(limitParam ?? "200")) || 200, 500);

  const rows = await db
    .select()
    .from(balanceSheetTxTable)
    .where(
      type && type !== "all"
        ? and(eq(balanceSheetTxTable.userId, userId), eq(balanceSheetTxTable.type, String(type)))
        : eq(balanceSheetTxTable.userId, userId)
    )
    .orderBy(desc(balanceSheetTxTable.txDate), desc(balanceSheetTxTable.createdAt))
    .limit(lim);

  res.json({ ledger: rows });
});

router.get("/enterprise/summary", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const [employeeRows] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(realEmployeesTable)
    .where(and(eq(realEmployeesTable.userId, userId), eq(realEmployeesTable.status, "active")));

  const [billRows] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pendingCount: sql<number>`count(*) filter (where ${billsTable.status} = 'pending')::int`,
      overdueCount: sql<number>`count(*) filter (where ${billsTable.status} = 'overdue')::int`,
    })
    .from(billsTable)
    .where(eq(billsTable.userId, userId));

  const [expenseRows] = await db
    .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${businessExpensesTable.amount}::numeric), 0)` })
    .from(businessExpensesTable)
    .where(eq(businessExpensesTable.userId, userId));

  const [invoiceRows] = await db
    .select({
      count: sql<number>`count(*)::int`,
      paidCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'paid')::int`,
      openCount: sql<number>`count(*) filter (where ${invoicesTable.status} in ('draft', 'sent'))::int`,
      overdueCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'overdue')::int`,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.userId, userId));

  const [payrollRows] = await db
    .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${payrollRunsTable.totalAmount}::numeric), 0)` })
    .from(payrollRunsTable)
    .where(eq(payrollRunsTable.userId, userId));

  const paidInvoices = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.status, "paid")));

  const paidInvoicesToday = await db
    .select()
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.userId, userId),
      eq(invoicesTable.status, "paid"),
      eq(invoicesTable.issueDate, today()),
    ));

  const grossIncome = paidInvoices.reduce((sum, inv) => {
    const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
    const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
    const tax = sub * ((inv.taxRate || 0) / 100);
    return sum + sub + tax;
  }, 0);
  const todayRevenue = paidInvoicesToday.reduce((sum, inv) => {
    const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
    const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
    return sum + sub + sub * ((inv.taxRate || 0) / 100);
  }, 0);

  const txRows = await db
    .select({ type: balanceSheetTxTable.type, amount: balanceSheetTxTable.amount })
    .from(balanceSheetTxTable)
    .where(eq(balanceSheetTxTable.userId, userId));

  const payrollTotal = txRows.filter(t => t.type === "payroll").reduce((s, t) => s + Number(t.amount), 0);
  const billsTotal = txRows.filter(t => t.type === "bill").reduce((s, t) => s + Number(t.amount), 0);
  const expensesTotal = txRows.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  res.json({
    employees: { active: employeeRows.count },
    bills: { total: billRows.count, pending: billRows.pendingCount, overdue: billRows.overdueCount },
    expenses: { total: expenseRows.count, amount: Number(expenseRows.total) },
    invoices: { total: invoiceRows.count, paid: invoiceRows.paidCount, open: invoiceRows.openCount, overdue: invoiceRows.overdueCount },
    payroll: { runs: payrollRows.count, total: Number(payrollRows.total) },
    financials: { grossIncome, todayRevenue, payrollTotal, billsTotal, expensesTotal, netProfit: grossIncome - payrollTotal - billsTotal - expensesTotal },
  });
});

// ─── Accounting · Financial Statements ─────────────────────────────────────
// Derives the standard accounting sheets (cash flow, general ledger, trial
// balance, AR/AP aging) from the same source data used elsewhere: paid
// invoices = revenue, balance_sheet_transactions = cash outflows. No new
// tables — the books are computed live so they always reconcile with P&L.
// The computation lives in the shared finance-engine so Pablo and other
// surfaces reuse the exact same numbers.

router.get("/enterprise/accounting", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const report = await getAccountingReport(req.user!.id);
  res.json(report);
});

// ─── Taxes · TurboTax-style estimator ──────────────────────────────────────
// The finance engine is an OPTIONAL attachment: with `?attach=1` (default) the
// estimator auto-imports income & expenses from the live books; with
// `?attach=0` the caller supplies figures manually via query overrides.
function numParam(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Resolve the data scope for a tax/finance read. `scope=org` aggregates every
// active member's books — but ONLY if the caller holds the required org
// permission. Anything else (or no org) falls back to the caller's own data.
// This is the single choke-point that turns "cross-use data per org if
// permissions abide" into an enforced, server-authoritative decision.
interface TaxScope {
  scope: "personal" | "org";
  userIds: string[];
  orgId?: number;
  permission?: OrgPermissionCheck;
}

async function resolveTaxScope(
  req: Request,
  userId: string,
  neededKey: OrgPermissionKey
): Promise<{ ok: true; ctx: TaxScope } | { ok: false; status: number; error: string }> {
  const wantsOrg = String(req.query.scope ?? "personal") === "org";
  if (!wantsOrg) return { ok: true, ctx: { scope: "personal", userIds: [userId] } };

  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { ok: false, status: 400, error: "You are not in an organization" };

  const gate = await canDoInOrg(userId, orgId, neededKey);
  if (!gate.allowed) {
    return { ok: false, status: 403, error: "You don't have permission to access org-wide finances" };
  }

  const ids = await getActiveOrgMemberIds(orgId);
  return { ok: true, ctx: { scope: "org", orgId, userIds: ids.length ? ids : [userId], permission: gate } };
}

// Compute an estimate for one or many users. Single-user keeps the exact prior
// behavior (real report attached). Multi-user sums each member's book summary
// and feeds the totals as income/expense overrides — computeTaxEstimate only
// reads summary + asOf, so the merged result is faithful.
async function computeScopedEstimate(userIds: string[], opts: TaxOverrides): Promise<TaxEstimate> {
  if (userIds.length <= 1) {
    const report = await getAccountingReport(userIds[0]);
    return computeTaxEstimate(report, opts);
  }
  const reports = await Promise.all(userIds.map((id) => getAccountingReport(id)));
  const income = reports.reduce((s, r) => s + r.summary.totalRevenue, 0);
  const expenses = reports.reduce(
    (s, r) => s + r.summary.totalPayroll + r.summary.totalBills + r.summary.totalExpenses,
    0
  );
  const merged = computeTaxEstimate(null, {
    ...opts,
    income: opts.income ?? income,
    expenses: opts.expenses ?? expenses,
  });
  return { ...merged, attached: true };
}

router.get("/enterprise/tax", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!await requireTaxProviderConnection(req, res)) return;
  const userId = req.user!.id;

  const attach = req.query.attach !== "0" && req.query.attach !== "false";
  const fsRaw = String(req.query.filingStatus ?? "single");
  const filingStatus: FilingStatus = fsRaw === "mfj" || fsRaw === "hoh" ? fsRaw : "single";

  const opts: TaxOverrides = {
    filingStatus,
    income: numParam(req.query.income),
    expenses: numParam(req.query.expenses),
    retirement: numParam(req.query.retirement),
    healthInsurance: numParam(req.query.healthInsurance),
    homeOffice: numParam(req.query.homeOffice),
  };

  if (!attach) {
    res.json({ ...computeTaxEstimate(null, opts), scope: "manual" });
    return;
  }

  const scoped = await resolveTaxScope(req, userId, "tax.view");
  if (!scoped.ok) {
    res.status(scoped.status).json({ error: scoped.error });
    return;
  }
  const estimate = await computeScopedEstimate(scoped.ctx.userIds, opts);
  res.json({ ...estimate, scope: scoped.ctx.scope, memberCount: scoped.ctx.userIds.length });
});

// Aggregate the books into tax-ready Schedule C inputs across one or many users.
// Gross receipts come from paid invoices (== report.summary.totalRevenue) and
// expense line items come straight from the balance-sheet ledger, so the
// Schedule C net profit reconciles with the estimator's netBusinessIncome.
async function buildTaxReadyInputs(userIds: string[]): Promise<{ grossReceipts: number; expenseItems: ScheduleCExpenseItem[] }> {
  const reports = await Promise.all(userIds.map((id) => getAccountingReport(id)));
  const grossReceipts = reports.reduce((s, r) => s + r.summary.totalRevenue, 0);

  const txRows = await db
    .select({ type: balanceSheetTxTable.type, category: balanceSheetTxTable.category, amount: balanceSheetTxTable.amount })
    .from(balanceSheetTxTable)
    .where(inArray(balanceSheetTxTable.userId, userIds));

  const expenseItems: ScheduleCExpenseItem[] = [];
  for (const t of txRows) {
    if (t.type === "income") continue;
    const amount = Number(t.amount) || 0;
    if (amount <= 0) continue;
    expenseItems.push({ category: t.category || "other", amount, isPayroll: t.type === "payroll" });
  }

  return { grossReceipts, expenseItems };
}

// Tax-ready Schedule C breakdown — books mapped onto IRS Form 1040 Schedule C
// line items, plus the matching estimate. Optional manual overrides mirror the
// /enterprise/tax route so the two stay consistent. `scope=org` aggregates the
// whole org when the caller holds finance.view.
router.get("/enterprise/tax/schedule-c", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!await requireTaxProviderConnection(req, res)) return;
  const userId = req.user!.id;

  const fsRaw = String(req.query.filingStatus ?? "single");
  const filingStatus: FilingStatus = fsRaw === "mfj" || fsRaw === "hoh" ? fsRaw : "single";

  const scoped = await resolveTaxScope(req, userId, "finance.view");
  if (!scoped.ok) {
    res.status(scoped.status).json({ error: scoped.error });
    return;
  }

  const { grossReceipts, expenseItems } = await buildTaxReadyInputs(scoped.ctx.userIds);
  const incomeOverride = numParam(req.query.income);
  const expensesOverride = numParam(req.query.expenses);

  const scheduleC = buildScheduleC({
    grossReceipts: incomeOverride ?? grossReceipts,
    returnsAllowances: numParam(req.query.returnsAllowances),
    expenseItems: expensesOverride != null
      ? [{ category: "other", amount: expensesOverride }]
      : expenseItems,
  });

  const estimate = await computeScopedEstimate(scoped.ctx.userIds, {
    filingStatus,
    income: incomeOverride,
    expenses: expensesOverride,
    retirement: numParam(req.query.retirement),
    healthInsurance: numParam(req.query.healthInsurance),
    homeOffice: numParam(req.query.homeOffice),
  });

  res.json({ scheduleC, estimate, scope: scoped.ctx.scope, memberCount: scoped.ctx.userIds.length });
});

// Tax-ready export — download the Schedule C + estimate as a file ready for
// TurboTax import / a CPA. format=json (default) | csv. `scope=org` requires
// the finance.export permission.
router.get("/enterprise/tax/export", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!await requireTaxProviderConnection(req, res)) return;
  const userId = req.user!.id;

  const fsRaw = String(req.query.filingStatus ?? "single");
  const filingStatus: FilingStatus = fsRaw === "mfj" || fsRaw === "hoh" ? fsRaw : "single";
  const format = String(req.query.format ?? "json").toLowerCase();

  const scoped = await resolveTaxScope(req, userId, "finance.export");
  if (!scoped.ok) {
    res.status(scoped.status).json({ error: scoped.error });
    return;
  }

  const { grossReceipts, expenseItems } = await buildTaxReadyInputs(scoped.ctx.userIds);
  const scheduleC = buildScheduleC({ grossReceipts, expenseItems });
  const estimate = await computeScopedEstimate(scoped.ctx.userIds, { filingStatus });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: string[] = [];
    rows.push("Section,Line,Description,Amount");
    rows.push(["Part I", "1", "Gross receipts", scheduleC.partI.grossReceipts].map(esc).join(","));
    rows.push(["Part I", "2", "Returns and allowances", scheduleC.partI.returnsAllowances].map(esc).join(","));
    rows.push(["Part I", "7", "Gross income", scheduleC.partI.grossIncome].map(esc).join(","));
    for (const l of scheduleC.partII) {
      rows.push(["Part II", l.line, l.label, l.amount].map(esc).join(","));
    }
    rows.push(["Part II", "28", "Total expenses", scheduleC.totalExpenses].map(esc).join(","));
    rows.push(["Part II", "31", "Net profit or (loss)", scheduleC.netProfit].map(esc).join(","));
    rows.push("");
    rows.push("Estimate,,Description,Amount");
    rows.push(["Estimate", "", "Filing status", estimate.filingStatus].map(esc).join(","));
    rows.push(["Estimate", "", "Self-employment tax", estimate.selfEmployment.total].map(esc).join(","));
    rows.push(["Estimate", "", "Income tax", estimate.incomeTax].map(esc).join(","));
    rows.push(["Estimate", "", "Total estimated tax", estimate.totalTax].map(esc).join(","));
    rows.push(["Estimate", "", "Quarterly payment", estimate.quarterlyPayment].map(esc).join(","));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="schedule-c-${stamp}.csv"`);
    return res.send(rows.join("\n"));
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="tax-ready-${stamp}.json"`);
  return res.send(JSON.stringify({ scheduleC, estimate, exportedAt: new Date().toISOString() }, null, 2));
});

router.get("/enterprise/fiat-balance", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user!.id;

  const txRows = await db
    .select({ type: balanceSheetTxTable.type, amount: balanceSheetTxTable.amount })
    .from(balanceSheetTxTable)
    .where(eq(balanceSheetTxTable.userId, userId));

  const income = txRows.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const outgoing = txRows.filter(t => t.type !== "income").reduce((s, t) => s + Number(t.amount), 0);

  const fiatBalance = income - outgoing;

  res.json({ fiatBalance });
});

router.get("/enterprise/gusto-status", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const gustoApiKey = process.env.GUSTO_API_KEY;
  if (!gustoApiKey) {
    return res.json({ connected: false });
  }

  try {
    const response = await fetch("https://api.gusto.com/v1/me", {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });

    if (!response.ok) {
      return res.json({ connected: false });
    }

    const data = await response.json() as Record<string, any>;
    const companyId = data?.roles?.payroll_admin?.companies?.[0]?.id;

    if (!companyId) {
      return res.json({ connected: true, companyName: "Gusto Account" });
    }

    const companyRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });

    if (!companyRes.ok) {
      return res.json({ connected: true, companyName: "Gusto Account" });
    }

    const company = await companyRes.json() as Record<string, any>;
    const employeesRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}/employees`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });
    const employees = employeesRes.ok ? await employeesRes.json() : [];

    const payrollsRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}/payrolls?processed=true&page=1&per=1`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });
    const payrolls = payrollsRes.ok ? await payrollsRes.json() : [];

    return res.json({
      connected: true,
      companyName: company.name || "Gusto Account",
      employeeCount: Array.isArray(employees) ? employees.length : 0,
      lastPayroll: Array.isArray(payrolls) && payrolls.length > 0 ? payrolls[0].check_date : null,
    });
  } catch {
    return res.json({ connected: false });
  }
});

router.get("/enterprise/gusto/employees", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const gustoApiKey = process.env.GUSTO_API_KEY;
  if (!gustoApiKey) return res.json({ connected: false, employees: [] });

  try {
    const meRes = await fetch("https://api.gusto.com/v1/me", { headers: { Authorization: `Bearer ${gustoApiKey}` } });
    if (!meRes.ok) return res.json({ connected: false, employees: [] });
    const me = await meRes.json() as Record<string, any>;
    const companyId = me?.roles?.payroll_admin?.companies?.[0]?.id;
    if (!companyId) return res.json({ connected: true, employees: [] });

    const empRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}/employees`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });
    if (!empRes.ok) return res.json({ connected: true, employees: [] });
    const rawEmployees = await empRes.json();

    const employees = Array.isArray(rawEmployees) ? rawEmployees.map((e: Record<string, unknown>) => ({
      id: e.id,
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      email: e.email ?? "",
      department: e.department ?? "",
      jobTitle: (e.current_employment_status as Record<string, unknown>)?.job_title ?? (e as Record<string, unknown>).job_title ?? "",
      status: e.terminated === true ? "terminated" : "active",
      hireDate: e.date_of_birth ? "" : "",
      payRate: "",
      payFrequency: "",
    })) : [];

    const jobsRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}/jobs`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });
    if (jobsRes.ok) {
      const jobs = await jobsRes.json();
      if (Array.isArray(jobs)) {
        for (const job of jobs) {
          const emp = employees.find((e: { id: unknown }) => e.id === job.employee_id);
          if (emp && job.compensations?.length > 0) {
            const comp = job.compensations[job.compensations.length - 1];
            emp.payRate = comp.rate ?? "";
            emp.payFrequency = comp.payment_unit ?? "";
            emp.jobTitle = job.title ?? emp.jobTitle;
          }
        }
      }
    }

    return res.json({ connected: true, employees });
  } catch {
    return res.json({ connected: false, employees: [] });
  }
});

router.get("/enterprise/gusto/payrolls", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const gustoApiKey = process.env.GUSTO_API_KEY;
  if (!gustoApiKey) return res.json({ connected: false, payrolls: [] });

  try {
    const meRes = await fetch("https://api.gusto.com/v1/me", { headers: { Authorization: `Bearer ${gustoApiKey}` } });
    if (!meRes.ok) return res.json({ connected: false, payrolls: [] });
    const me = await meRes.json() as Record<string, any>;
    const companyId = me?.roles?.payroll_admin?.companies?.[0]?.id;
    if (!companyId) return res.json({ connected: true, payrolls: [] });

    const payRes = await fetch(`https://api.gusto.com/v1/companies/${companyId}/payrolls?processed=true&page=1&per=20`, {
      headers: { Authorization: `Bearer ${gustoApiKey}` },
    });
    if (!payRes.ok) return res.json({ connected: true, payrolls: [] });
    const rawPayrolls = await payRes.json();

    const payrolls = Array.isArray(rawPayrolls) ? rawPayrolls.map((p: Record<string, unknown>) => ({
      id: p.id,
      payPeriodStart: (p.pay_period as Record<string, unknown>)?.start_date ?? p.pay_period_start ?? "",
      payPeriodEnd: (p.pay_period as Record<string, unknown>)?.end_date ?? p.pay_period_end ?? "",
      checkDate: p.check_date ?? "",
      processed: p.processed ?? false,
      totalGrossPay: p.totals ? (p.totals as Record<string, unknown>).gross_pay ?? "0" : "0",
      totalNetPay: p.totals ? (p.totals as Record<string, unknown>).net_pay ?? "0" : "0",
      totalTaxes: p.totals ? (p.totals as Record<string, unknown>).employee_taxes ?? "0" : "0",
      totalDeductions: p.totals ? (p.totals as Record<string, unknown>).employee_deductions ?? "0" : "0",
      employeeCount: Array.isArray(p.employee_compensations) ? p.employee_compensations.length : 0,
    })) : [];

    return res.json({ connected: true, payrolls });
  } catch {
    return res.json({ connected: false, payrolls: [] });
  }
});

router.get("/enterprise/gusto/company", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const gustoApiKey = process.env.GUSTO_API_KEY;
  if (!gustoApiKey) return res.json({ connected: false });

  try {
    const meRes = await fetch("https://api.gusto.com/v1/me", { headers: { Authorization: `Bearer ${gustoApiKey}` } });
    if (!meRes.ok) return res.json({ connected: false });
    const me = await meRes.json() as Record<string, any>;
    const companyId = me?.roles?.payroll_admin?.companies?.[0]?.id;
    if (!companyId) return res.json({ connected: true, company: null });

    const [compRes, empRes, payRes, locRes] = await Promise.all([
      fetch(`https://api.gusto.com/v1/companies/${companyId}`, { headers: { Authorization: `Bearer ${gustoApiKey}` } }),
      fetch(`https://api.gusto.com/v1/companies/${companyId}/employees`, { headers: { Authorization: `Bearer ${gustoApiKey}` } }),
      fetch(`https://api.gusto.com/v1/companies/${companyId}/payrolls?processed=true&page=1&per=5`, { headers: { Authorization: `Bearer ${gustoApiKey}` } }),
      fetch(`https://api.gusto.com/v1/companies/${companyId}/locations`, { headers: { Authorization: `Bearer ${gustoApiKey}` } }),
    ]);

    const company = (compRes.ok ? await compRes.json() : {}) as Record<string, any>;
    const employees = (empRes.ok ? await empRes.json() : []) as any[];
    const payrolls = (payRes.ok ? await payRes.json() : []) as any[];
    const locations = (locRes.ok ? await locRes.json() : []) as any[];

    const activeEmps = Array.isArray(employees) ? employees.filter((e: Record<string, unknown>) => e.terminated !== true) : [];
    const lastPayroll = Array.isArray(payrolls) && payrolls.length > 0 ? payrolls[0] : null;

    return res.json({
      connected: true,
      company: {
        name: company.name ?? company.trade_name ?? "Unknown",
        ein: company.ein ?? "",
        entityType: company.entity_type ?? "",
        companyStatus: company.company_status ?? "",
        employeeCount: activeEmps.length,
        totalEmployees: Array.isArray(employees) ? employees.length : 0,
        locationCount: Array.isArray(locations) ? locations.length : 0,
        lastPayrollDate: lastPayroll?.check_date ?? null,
        lastPayrollGross: lastPayroll?.totals?.gross_pay ?? null,
        lastPayrollNet: lastPayroll?.totals?.net_pay ?? null,
        payFrequency: company.primary_payroll?.pay_schedule_type ?? "",
      },
    });
  } catch {
    return res.json({ connected: false });
  }
});

export default router;
