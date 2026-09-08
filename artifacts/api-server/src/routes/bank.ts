import { Router, type IRouter, type Request, type Response } from "express";
import { db, bankAccountsTable, bankTransactionsTable, type BankAccount } from "@workspace/db";
import { eq, and, desc, sql, inArray, asc } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { ensureFiatAccounts, getSpendableFiat, STARTER_CHECKING_BALANCE } from "../lib/fiat-wallet";
import { restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";
export { STARTER_CHECKING_BALANCE } from "../lib/fiat-wallet";

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

function emailOf(req: Request): string | null {
  return (req.user as { email?: string | null } | undefined)?.email ?? null;
}

// TESTING infusion: new players start with a 200,000ƒ spendable grant so they
// can afford office/apartment layouts in the pledge store while we test the
// economy. (The hourly unemployment stipend is separate and stays at 500ƒ/hr.)
// Lower this back toward the lean starter grant once testing wraps.
// NOTE: update this constant and nothing else — onboard-housing/quote reads it
// directly so the debt callout stays in sync automatically.
// First-touch bank seed. Idempotent: only seeds when the player has no
// accounts yet. Picasso/owner/dev-org staff (detected by the passed-in email
// allow-list OR a DB-backed owner/dev-org lookup) get the staff seed; everyone
// else gets the lean starter grant.
async function ensureSeeded(userId: string, email?: string | null): Promise<BankAccount[]> {
  await restoreLegacyRecoveryForUser(userId, email);
  return db.transaction((tx) => ensureFiatAccounts(tx, userId));
}

router.get("/economy/bank/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const accounts = await ensureSeeded(uid(req), emailOf(req));
  const wallet = await getSpendableFiat(uid(req));
  res.json({ accounts: accounts.filter((account) => account.kind !== "cash"), spendable: wallet.spendable });
});

async function nextAccountNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = String(randomInt(1_000_000_000, 10_000_000_000));
    const [taken] = await tx.select({ id: bankAccountsTable.id }).from(bankAccountsTable)
      .where(eq(bankAccountsTable.accountNumber, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new Error("Unable to allocate a unique account number");
}

router.post("/economy/bank/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const kind = req.body?.kind;
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 64) : "";
  if (kind !== "checking" && kind !== "savings") {
    res.status(400).json({ error: "Choose checking or savings" });
    return;
  }
  if (label.length < 1) {
    res.status(400).json({ error: "Account name is required" });
    return;
  }
  await ensureSeeded(userId, emailOf(req));
  try {
    const account = await db.transaction(async (tx) => {
      const accountNumber = await nextAccountNumber(tx);
      const [created] = await tx.insert(bankAccountsTable).values({
        userId, kind, label, accountNumber, balance: 0, currency: "FIAT", apyBps: 0,
      }).returning();
      return created;
    });
    res.status(201).json({ account });
  } catch (error) {
    console.error("[Bank] account opening failed:", error);
    res.status(500).json({ error: "Could not open account" });
  }
});

router.get("/economy/bank/transactions", async (req, res) => {
  if (!requireAuth(req, res)) return;
  await ensureSeeded(uid(req), emailOf(req));
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const rows = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.userId, uid(req)))
    .orderBy(desc(bankTransactionsTable.createdAt))
    .limit(limit);
  res.json({ transactions: rows });
});

router.post("/economy/bank/transfer", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const { fromId, toId, amount, memo } = req.body ?? {};
  const amt = Math.round(Number(amount));
  if (!fromId || !toId || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "fromId, toId, amount required" });
    return;
  }
  if (fromId === toId) {
    res.status(400).json({ error: "From and To must differ" });
    return;
  }

  await ensureSeeded(userId, emailOf(req));
  const result = await db.transaction(async (tx) => {
    const accounts = await tx
      .select()
      .from(bankAccountsTable)
      .where(and(
        eq(bankAccountsTable.userId, userId),
        inArray(bankAccountsTable.id, [Number(fromId), Number(toId)]),
      ))
      .orderBy(asc(bankAccountsTable.id))
      .for("update");
    const from = accounts.find((account) => account.id === Number(fromId));
    const to = accounts.find((account) => account.id === Number(toId));
    if (!from || !to) return { type: "missing" as const };
    if (from.balance < amt) return { type: "insufficient" as const };
    const newFrom = from.balance - amt;
    const newTo = to.balance + amt;
    const note = String(memo ?? "TRANSFER").slice(0, 200);
    await tx.update(bankAccountsTable).set({ balance: newFrom, updatedAt: new Date() }).where(eq(bankAccountsTable.id, from.id));
    await tx.update(bankAccountsTable).set({ balance: newTo, updatedAt: new Date() }).where(eq(bankAccountsTable.id, to.id));
    await tx.insert(bankTransactionsTable).values([
      { userId, accountId: from.id, counterpartyAccountId: to.id, kind: "transfer", description: `→ ${to.label}: ${note}`, amount: -amt, balanceAfter: newFrom },
      { userId, accountId: to.id, counterpartyAccountId: from.id, kind: "transfer", description: `← ${from.label}: ${note}`, amount: amt, balanceAfter: newTo },
    ]);
    return { type: "ok" as const };
  });
  if (result.type === "missing") {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (result.type === "insufficient") {
    res.status(400).json({ error: "Insufficient funds" });
    return;
  }

  const updated = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  res.json({ ok: true, accounts: updated });
});

router.post("/economy/bank/deposit", async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(410).json({
    error: "Direct balance adjustments are retired. Use salary, earnings, transfers, or confirmed FIAT top-ups.",
  });
});

// Move already-earned/spendable FIAT from checking into savings. This is a
// transfer, never an income event; "all" consolidates the whole checking
// balance and the two ledger rows keep the money supply unchanged.
router.post("/economy/bank/consolidate-savings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await ensureSeeded(userId, emailOf(req));
  const requested = req.body?.amount === "all" ? null : Math.round(Number(req.body?.amount));
  if (requested !== null && (!Number.isFinite(requested) || requested <= 0)) {
    res.status(400).json({ error: "amount must be a positive integer or all" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const accounts = await tx.select().from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), inArray(bankAccountsTable.kind, ["checking", "savings"])))
      .orderBy(asc(bankAccountsTable.id)).for("update");
    const checking = accounts.find((account) => account.kind === "checking");
    const savings = accounts.find((account) => account.kind === "savings");
    if (!checking || !savings) return { type: "missing" as const };
    const amount = requested ?? checking.balance;
    if (amount <= 0 || checking.balance < amount) return { type: "insufficient" as const, balance: checking.balance };
    const checkingAfter = checking.balance - amount;
    const savingsAfter = savings.balance + amount;
    await tx.update(bankAccountsTable).set({ balance: checkingAfter, updatedAt: new Date() }).where(eq(bankAccountsTable.id, checking.id));
    await tx.update(bankAccountsTable).set({ balance: savingsAfter, updatedAt: new Date() }).where(eq(bankAccountsTable.id, savings.id));
    await tx.insert(bankTransactionsTable).values([
      { userId, accountId: checking.id, counterpartyAccountId: savings.id, kind: "transfer", description: "CHECKING → SAVINGS CONSOLIDATION", amount: -amount, balanceAfter: checkingAfter },
      { userId, accountId: savings.id, counterpartyAccountId: checking.id, kind: "transfer", description: "FIAT SAVINGS CONSOLIDATION", amount, balanceAfter: savingsAfter },
    ]);
    return { type: "ok" as const, amount };
  });
  if (result.type === "missing") res.status(404).json({ error: "Checking or savings account not found" });
  else if (result.type === "insufficient") res.status(400).json({ error: "Insufficient checking balance", balance: result.balance });
  else res.json({ ok: true, consolidated: result.amount, accounts: await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId)) });
});

// Gold → real-money cash-out. Converts client-authoritative GOLD into the
// player's withdrawable real-money USD pool (= the server checking balance the
// wallet snapshot reports as "AVAILABLE $"), minus a flat fee. The actual
// payout to a real bank still runs through PABLO CORP payroll (Gusto), which is
// a separate step; this just moves value into the withdrawable pool.
// Cash-out is GOLD-only — starter & unemployment grants are FIAT and never
// become gold, so they can never be cashed out to real money.
router.post("/economy/bank/cashout", async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(409).json({
    error: "Gold cash-out is unavailable until gold is held in the server ledger.",
  });
});

export default router;
