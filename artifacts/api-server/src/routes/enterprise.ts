import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  realEmployeesTable,
  payrollRunsTable,
  billsTable,
  businessExpensesTable,
  balanceSheetTxTable,
  invoicesTable,
} from "@workspace/db";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
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
  const totalAmount = breakdownArr.reduce((sum: number, item: { amount?: number }) => sum + (Number(item.amount) || 0), 0);

  const [row] = await db
    .insert(payrollRunsTable)
    .values({
      userId,
      payPeriodStart: String(payPeriodStart),
      payPeriodEnd: String(payPeriodEnd),
      runDate: runDate ? String(runDate) : today(),
      totalAmount: String(totalAmount),
      breakdown: breakdownArr,
      notes: notes ? String(notes) : "",
    })
    .returning();

  await recordTx(
    userId,
    "payroll",
    "payroll",
    totalAmount,
    `Payroll run: ${payPeriodStart} to ${payPeriodEnd}`,
    row.id,
    "payroll_run",
    row.runDate
  );

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
  if (status) {
    if (!isOneOf(status, VALID_BILL_STATUSES)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.status = status;
  }
  if (isPaying) updates.paidAt = new Date();

  const [row] = await db
    .update(billsTable)
    .set(updates)
    .where(and(eq(billsTable.id, id), eq(billsTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  if (isPaying) {
    await deleteTx(userId, id, "bill");
    await recordTx(
      userId,
      "bill",
      row.category,
      Number(row.amount),
      `Bill paid: ${row.vendor}${row.description ? ` — ${row.description}` : ""}`,
      row.id,
      "bill",
      today()
    );
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

  const txRows = await db
    .select()
    .from(balanceSheetTxTable)
    .where(eq(balanceSheetTxTable.userId, userId))
    .orderBy(desc(balanceSheetTxTable.txDate), desc(balanceSheetTxTable.createdAt));

  const paidInvoices = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.status, "paid")));

  const grossInvoiceIncome = paidInvoices.reduce((sum, inv) => {
    const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
    const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
    const tax = sub * ((inv.taxRate || 0) / 100);
    return sum + sub + tax;
  }, 0);

  const payrollTotal = txRows.filter(t => t.type === "payroll").reduce((s, t) => s + Number(t.amount), 0);
  const billsTotal = txRows.filter(t => t.type === "bill").reduce((s, t) => s + Number(t.amount), 0);
  const expensesTotal = txRows.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const totalOutgoings = payrollTotal + billsTotal + expensesTotal;
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
      totalOutgoings,
      netProfit,
    },
    categoryBreakdown,
    ledger: txRows,
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

  const grossIncome = paidInvoices.reduce((sum, inv) => {
    const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems as { quantity: number; rate: number }[] : [];
    const sub = lineItems.reduce((s, item) => s + item.quantity * item.rate, 0);
    const tax = sub * ((inv.taxRate || 0) / 100);
    return sum + sub + tax;
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
    financials: { grossIncome, payrollTotal, billsTotal, expensesTotal, netProfit: grossIncome - payrollTotal - billsTotal - expensesTotal },
  });
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
