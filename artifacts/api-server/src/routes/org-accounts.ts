import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  orgAccountsTable,
  orgAccountTransactionsTable,
  organizationsTable,
  balanceSheetTxTable,
  type OrgAccount,
} from "@workspace/db";
import type { InferInsertModel } from "drizzle-orm";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId, getActiveOrgMemberIds } from "../lib/org-permissions";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function uid(req: Request): string {
  return String((req.user as { id: string }).id);
}

async function resolveOrgId(req: Request, res: Response): Promise<number | null> {
  const paramId = req.params.orgId;
  if (paramId && paramId !== "current") {
    const n = Number(paramId);
    if (!Number.isFinite(n) || n <= 0) {
      res.status(400).json({ error: "Invalid orgId" });
      return null;
    }
    return n;
  }
  const orgId = await resolveCurrentOrgId(uid(req));
  if (!orgId) {
    res.status(404).json({ error: "No active organization found" });
    return null;
  }
  return orgId;
}

export async function ensureOrgAccounts(orgId: number): Promise<OrgAccount[]> {
  const existing = await db
    .select()
    .from(orgAccountsTable)
    .where(eq(orgAccountsTable.orgId, orgId));

  if (existing.length >= 2) return existing;

  const existingTypes = new Set(existing.map((a) => a.type));
  const toInsert: InferInsertModel<typeof orgAccountsTable>[] = [];
  if (!existingTypes.has("checking")) {
    toInsert.push({ orgId, type: "checking", label: "ORG CHECKING", balanceFiat: 0, apyBps: 0 });
  }
  if (!existingTypes.has("savings")) {
    toInsert.push({ orgId, type: "savings", label: "ORG SAVINGS", balanceFiat: 0, apyBps: 425 });
  }
  if (toInsert.length === 0) return existing;
  const inserted = await db.insert(orgAccountsTable).values(toInsert).returning();
  return [...existing, ...inserted];
}

/**
 * Internal service function — credit or debit an org account.
 * NOT exposed as an HTTP endpoint. Called from invoice/marketplace/interest hooks.
 * delta > 0 = credit, delta < 0 = debit (balance floored at 0 for debits).
 */
export async function creditOrgAccount(
  orgId: number,
  accountType: "checking" | "savings",
  delta: number,
  description: string,
  category: string,
  actorUserId?: string | null,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  const amt = Math.round(delta);

  const accounts = await ensureOrgAccounts(orgId);
  const account = accounts.find((a) => a.type === accountType);
  if (!account) return;

  await db.transaction(async (tx) => {
    const [upd] = await tx
      .update(orgAccountsTable)
      .set({
        balanceFiat: sql`greatest(0, ${orgAccountsTable.balanceFiat} + ${amt})`,
        updatedAt: new Date(),
      })
      .where(eq(orgAccountsTable.id, account.id))
      .returning();

    await tx.insert(orgAccountTransactionsTable).values({
      orgId,
      accountType,
      delta: amt,
      balanceAfter: upd?.balanceFiat ?? Math.max(0, account.balanceFiat + amt),
      description: String(description).slice(0, 500),
      category: String(category).slice(0, 60),
      actorUserId: actorUserId ?? null,
    });
  });
}

// GET /orgs/:orgId/accounts
// Returns both account balances + independently paginated transaction history.
// Pagination: ?checkingPage=1&savingsPage=1 (50 rows/page per account type).
// Requires finance.view (Manager+).
router.get("/orgs/:orgId/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;

  const gate = await canDoInOrg(uid(req), orgId, "finance.view");
  if (!gate.allowed) {
    res.status(403).json({ error: "Requires finance.view permission (Manager+)" });
    return;
  }

  const accounts = await ensureOrgAccounts(orgId);

  const perPage = 50;
  const checkingPage = Math.max(1, parseInt(String(req.query.checkingPage ?? "1"), 10) || 1);
  const savingsPage  = Math.max(1, parseInt(String(req.query.savingsPage  ?? "1"), 10) || 1);

  // Query each account type independently so pagination is per-account, not shared.
  const [checkingTx, savingsTx] = await Promise.all([
    db.select()
      .from(orgAccountTransactionsTable)
      .where(and(
        eq(orgAccountTransactionsTable.orgId, orgId),
        eq(orgAccountTransactionsTable.accountType, "checking")
      ))
      .orderBy(desc(orgAccountTransactionsTable.createdAt))
      .limit(perPage)
      .offset((checkingPage - 1) * perPage),
    db.select()
      .from(orgAccountTransactionsTable)
      .where(and(
        eq(orgAccountTransactionsTable.orgId, orgId),
        eq(orgAccountTransactionsTable.accountType, "savings")
      ))
      .orderBy(desc(orgAccountTransactionsTable.createdAt))
      .limit(perPage)
      .offset((savingsPage - 1) * perPage),
  ]);

  const [org] = await db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  res.json({
    orgId,
    orgName: org?.name ?? "",
    accounts,
    transactions: { checking: checkingTx, savings: savingsTx },
    pagination: {
      checkingPage,
      savingsPage,
      perPage,
      checkingHasMore: checkingTx.length === perPage,
      savingsHasMore:  savingsTx.length  === perPage,
    },
  });
});

// POST /orgs/:orgId/accounts/transfer
// Atomically moves fiat between checking and savings.
// Uses an atomic SQL conditional update (balance >= amt guard) to prevent
// overdraft and race conditions under concurrent transfers.
// Requires finance.manage (Director+).
router.post("/orgs/:orgId/accounts/transfer", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;

  const gate = await canDoInOrg(uid(req), orgId, "finance.manage");
  if (!gate.allowed) {
    res.status(403).json({ error: "Requires finance.manage permission (Director+)" });
    return;
  }

  const { fromType, toType, amount, memo } = req.body ?? {};
  const amt = Math.round(Number(amount));
  if (!fromType || !toType || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "fromType, toType, and positive amount required" });
    return;
  }
  if (fromType === toType) {
    res.status(400).json({ error: "fromType and toType must differ" });
    return;
  }
  if (!["checking", "savings"].includes(fromType) || !["checking", "savings"].includes(toType)) {
    res.status(400).json({ error: "Account types must be checking or savings" });
    return;
  }

  const accounts = await ensureOrgAccounts(orgId);
  const from = accounts.find((a) => a.type === fromType);
  const to = accounts.find((a) => a.type === toType);
  if (!from || !to) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const note = String(memo ?? "TRANSFER").slice(0, 200);
  const actorUserId = uid(req);

  let updatedAccounts: OrgAccount[];
  try {
    updatedAccounts = await db.transaction(async (tx) => {
      // Atomic debit with balance guard — WHERE clause acts as CAS; returns 0 rows
      // if balance changed concurrently or is insufficient.
      const [updatedFrom] = await tx
        .update(orgAccountsTable)
        .set({
          balanceFiat: sql`${orgAccountsTable.balanceFiat} - ${amt}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orgAccountsTable.id, from.id),
            sql`${orgAccountsTable.balanceFiat} >= ${amt}`
          )
        )
        .returning();

      if (!updatedFrom) {
        throw Object.assign(new Error("Insufficient funds"), { code: "INSUFFICIENT_FUNDS" });
      }

      const [updatedTo] = await tx
        .update(orgAccountsTable)
        .set({
          balanceFiat: sql`${orgAccountsTable.balanceFiat} + ${amt}`,
          updatedAt: new Date(),
        })
        .where(eq(orgAccountsTable.id, to.id))
        .returning();

      await tx.insert(orgAccountTransactionsTable).values([
        {
          orgId,
          accountType: fromType,
          delta: -amt,
          balanceAfter: updatedFrom.balanceFiat,
          description: `TRANSFER → ${to.label}: ${note}`,
          category: "transfer",
          actorUserId,
        },
        {
          orgId,
          accountType: toType,
          delta: amt,
          balanceAfter: updatedTo!.balanceFiat,
          description: `TRANSFER ← ${from.label}: ${note}`,
          category: "transfer",
          actorUserId,
        },
      ]);

      return [updatedFrom, updatedTo!];
    });
  } catch (err: any) {
    if (err?.code === "INSUFFICIENT_FUNDS") {
      res.status(400).json({ error: "Insufficient funds" });
      return;
    }
    throw err;
  }

  res.json({ ok: true, accounts: updatedAccounts });
});

// GET /orgs/:orgId/accounts/revenue-flow
// Aggregate income vs outflow by category for the current month.
// Requires finance.view (Manager+).
router.get("/orgs/:orgId/accounts/revenue-flow", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const orgId = await resolveOrgId(req, res);
  if (!orgId) return;

  const gate = await canDoInOrg(uid(req), orgId, "finance.view");
  if (!gate.allowed) {
    res.status(403).json({ error: "Requires finance.view permission (Manager+)" });
    return;
  }

  const memberIds = await getActiveOrgMemberIds(orgId);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = now.toISOString().slice(0, 10);

  let invoiceIncome = 0;
  let marketplaceIncome = 0;
  let botIncome = 0;
  let interestIncome = 0;
  let payrollOut = 0;
  let billsOut = 0;
  let expensesOut = 0;
  let pabloTaxOut = 0;

  if (memberIds.length > 0) {
    const txRows = await db
      .select({ type: balanceSheetTxTable.type, category: balanceSheetTxTable.category, amount: balanceSheetTxTable.amount })
      .from(balanceSheetTxTable)
      .where(
        and(
          inArray(balanceSheetTxTable.userId, memberIds),
          gte(balanceSheetTxTable.txDate, monthStart),
          lte(balanceSheetTxTable.txDate, monthEnd)
        )
      );

    for (const row of txRows) {
      const amt = Math.abs(Number(row.amount));
      if (row.type === "income") {
        const cat = row.category?.toLowerCase() ?? "";
        if (cat.includes("marketplace") || cat.includes("sale")) marketplaceIncome += amt;
        else if (cat.includes("bot") || cat.includes("agent")) botIncome += amt;
        else invoiceIncome += amt;
      } else if (row.type === "payroll") {
        payrollOut += amt;
      } else if (row.type === "bill") {
        const cat = row.category?.toLowerCase() ?? "";
        if (cat.includes("pablo") || cat.includes("tax")) pabloTaxOut += amt;
        else billsOut += amt;
      } else if (row.type === "expense") {
        expensesOut += amt;
      }
    }
  }

  const orgTxRows = await db
    .select({ category: orgAccountTransactionsTable.category, delta: orgAccountTransactionsTable.delta })
    .from(orgAccountTransactionsTable)
    .where(
      and(
        eq(orgAccountTransactionsTable.orgId, orgId),
        gte(
          sql`${orgAccountTransactionsTable.createdAt}::date`,
          sql`${monthStart}::date`
        )
      )
    );

  for (const row of orgTxRows) {
    if (row.delta > 0) {
      const cat = row.category?.toLowerCase() ?? "";
      if (cat === "interest") interestIncome += row.delta;
      else if (cat.includes("invoice")) invoiceIncome += row.delta;
      else if (cat.includes("marketplace") || cat.includes("sale")) marketplaceIncome += row.delta;
      else if (cat.includes("bot") || cat.includes("agent")) botIncome += row.delta;
    }
  }

  const grossRevenue = invoiceIncome + marketplaceIncome + botIncome + interestIncome;
  const totalOutflows = payrollOut + billsOut + expensesOut + pabloTaxOut;
  const netPosition = grossRevenue - totalOutflows;

  const incomeSources = [
    { name: "Invoices Paid", value: Math.round(invoiceIncome), color: "#38bdf8" },
    { name: "Marketplace Sales", value: Math.round(marketplaceIncome), color: "#34d399" },
    { name: "Bot Earnings", value: Math.round(botIncome), color: "#a78bfa" },
    { name: "Interest", value: Math.round(interestIncome), color: "#fbbf24" },
  ].filter((s) => s.value > 0);

  const outflowCategories = [
    { name: "Payroll", value: Math.round(payrollOut), color: "#60a5fa" },
    { name: "Bills & Rent", value: Math.round(billsOut), color: "#f97316" },
    { name: "Expenses", value: Math.round(expensesOut), color: "#c084fc" },
    { name: "Pablo Tax", value: Math.round(pabloTaxOut), color: "#fb7185" },
  ].filter((s) => s.value > 0);

  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  res.json({
    monthLabel,
    grossRevenue: Math.round(grossRevenue),
    totalOutflows: Math.round(totalOutflows),
    netPosition: Math.round(netPosition),
    incomeSources,
    outflowCategories,
  });
});

// ── Nightly savings interest tick ─────────────────────────────────────────────
// Pro-rates daily interest for each org savings account (apyBps / 10000 / 365).
// Idempotent per org per day: skips accounts that already have an "interest"
// transaction recorded today.

let _interestInterval: ReturnType<typeof setInterval> | null = null;
const DAY_MS = 24 * 60 * 60 * 1_000;

async function runInterestTick(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const savingsAccounts = await db
      .select()
      .from(orgAccountsTable)
      .where(
        and(
          eq(orgAccountsTable.type, "savings"),
          sql`${orgAccountsTable.balanceFiat} > 0`,
          sql`${orgAccountsTable.apyBps} > 0`
        )
      );

    let credited = 0;
    for (const acct of savingsAccounts) {
      const dailyInterest = Math.round(acct.balanceFiat * (acct.apyBps / 10_000) / 365);
      if (dailyInterest < 1) continue;

      const [alreadyCredited] = await db
        .select({ id: orgAccountTransactionsTable.id })
        .from(orgAccountTransactionsTable)
        .where(
          and(
            eq(orgAccountTransactionsTable.orgId, acct.orgId),
            eq(orgAccountTransactionsTable.accountType, "savings"),
            eq(orgAccountTransactionsTable.category, "interest"),
            sql`${orgAccountTransactionsTable.createdAt}::date = ${today}::date`
          )
        )
        .limit(1);

      if (alreadyCredited) continue;

      await creditOrgAccount(
        acct.orgId,
        "savings",
        dailyInterest,
        `DAILY INTEREST ${today} (${(acct.apyBps / 100).toFixed(2)}% APY)`,
        "interest",
      );
      credited++;
    }
    console.log(`[OrgAccounts] Interest tick: ${credited}/${savingsAccounts.length} account(s) credited.`);
  } catch (err) {
    console.error("[OrgAccounts] Interest tick error:", err);
  }
}

export function startOrgAccountInterestTick(): void {
  if (_interestInterval) return;
  setTimeout(() => { void runInterestTick(); }, 90_000);
  _interestInterval = setInterval(() => { void runInterestTick(); }, DAY_MS);
  console.log("[OrgAccounts] Savings interest tick scheduled (daily).");
}

// ── Startup backfill ──────────────────────────────────────────────────────────
// Seeds checking+savings rows for orgs created before this feature was deployed.

export async function backfillOrgAccounts(): Promise<void> {
  try {
    const orgs = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable);
    let seeded = 0;
    for (const org of orgs) {
      const [existing] = await db
        .select({ id: orgAccountsTable.id })
        .from(orgAccountsTable)
        .where(eq(orgAccountsTable.orgId, org.id))
        .limit(1);
      if (!existing) {
        await ensureOrgAccounts(org.id);
        seeded++;
      }
    }
    if (seeded > 0) {
      console.log(`[OrgAccounts] Backfill: seeded accounts for ${seeded} existing org(s).`);
    }
  } catch (err) {
    console.error("[OrgAccounts] Backfill error:", err);
  }
}

export default router;
