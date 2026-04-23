import { Router, type IRouter, type Request, type Response } from "express";
import { db, bankAccountsTable, bankTransactionsTable, type BankAccount } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

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

const SEED_DEFS = [
  { kind: "checking", label: "STANDARD CHECKING", balance: 12_400, apyBps: 0 },
  { kind: "savings",  label: "HIGH-YIELD SAVINGS", balance: 48_000, apyBps: 425 },
  { kind: "vault",    label: "GOLD VAULT",          balance: 80_000, apyBps: 0 },
] as const;

async function ensureSeeded(userId: string): Promise<BankAccount[]> {
  const existing = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  if (existing.length > 0) return existing;
  const inserted = await db
    .insert(bankAccountsTable)
    .values(SEED_DEFS.map((s) => ({ userId, kind: s.kind, label: s.label, balance: s.balance, apyBps: s.apyBps })))
    .returning();
  return inserted;
}

router.get("/economy/bank/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const accounts = await ensureSeeded(uid(req));
  res.json({ accounts });
});

router.get("/economy/bank/transactions", async (req, res) => {
  if (!requireAuth(req, res)) return;
  await ensureSeeded(uid(req));
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

  const accounts = await ensureSeeded(userId);
  const from = accounts.find((a) => a.id === Number(fromId));
  const to = accounts.find((a) => a.id === Number(toId));
  if (!from || !to) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (from.balance < amt) {
    res.status(400).json({ error: "Insufficient funds" });
    return;
  }

  const newFrom = from.balance - amt;
  const newTo = to.balance + amt;
  const note = String(memo ?? "TRANSFER").slice(0, 200);

  await db.transaction(async (tx) => {
    await tx.update(bankAccountsTable).set({ balance: newFrom, updatedAt: new Date() }).where(eq(bankAccountsTable.id, from.id));
    await tx.update(bankAccountsTable).set({ balance: newTo,   updatedAt: new Date() }).where(eq(bankAccountsTable.id, to.id));
    await tx.insert(bankTransactionsTable).values([
      { userId, accountId: from.id, counterpartyAccountId: to.id, kind: "transfer", description: `→ ${to.label}: ${note}`, amount: -amt, balanceAfter: newFrom },
      { userId, accountId: to.id,   counterpartyAccountId: from.id, kind: "transfer", description: `← ${from.label}: ${note}`, amount:  amt, balanceAfter: newTo },
    ]);
  });

  const updated = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  res.json({ ok: true, accounts: updated });
});

router.post("/economy/bank/deposit", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const { accountId, amount, memo, kind } = req.body ?? {};
  const amt = Math.round(Number(amount));
  if (!accountId || !Number.isFinite(amt) || amt === 0) {
    res.status(400).json({ error: "accountId and non-zero amount required" });
    return;
  }
  const [account] = await db
    .select()
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.id, Number(accountId)), eq(bankAccountsTable.userId, userId)));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const newBal = account.balance + amt;
  if (newBal < 0) {
    res.status(400).json({ error: "Insufficient funds" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(bankAccountsTable).set({ balance: newBal, updatedAt: new Date() }).where(eq(bankAccountsTable.id, account.id));
    await tx.insert(bankTransactionsTable).values({
      userId,
      accountId: account.id,
      kind: String(kind ?? (amt > 0 ? "deposit" : "withdraw")).slice(0, 24),
      description: String(memo ?? "").slice(0, 200),
      amount: amt,
      balanceAfter: newBal,
    });
  });

  res.json({ ok: true, balance: newBal });
});

export default router;
