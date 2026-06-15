import { Router, type IRouter, type Request, type Response } from "express";
import { db, bankAccountsTable, bankTransactionsTable, usersTable, type BankAccount } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { isOwnerEmail, isActiveDeveloperOrgMember, isPicassoOrgMemberEmail, PICASSO_START_FIAT } from "../lib/plan";

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

// Staff (Picasso org / owner / dev-org) get a near-bottomless spendable
// checking balance so internal staff never burn real cash; normal new players
// get the lean starter grant. The seed is never quarantined (player_ledger
// quarantineFiat defaults to 0 and is never written), so it's fully spendable.
const STAFF_SEED_DEFS = [
  { kind: "checking", label: "STANDARD CHECKING", balance: PICASSO_START_FIAT, apyBps: 0 },
  { kind: "savings",  label: "HIGH-YIELD SAVINGS", balance: 48_000, apyBps: 425 },
  { kind: "vault",    label: "GOLD VAULT",          balance: 80_000, apyBps: 0 },
] as const;

// TESTING infusion: new players start with a 200,000ƒ spendable grant so they
// can afford office/apartment layouts in the pledge store while we test the
// economy. (The hourly unemployment stipend is separate and stays at 500ƒ/hr.)
// Lower this back toward the lean starter grant once testing wraps.
const STARTER_SEED_DEFS = [
  { kind: "checking", label: "STANDARD CHECKING", balance: 200_000, apyBps: 0 },
  { kind: "savings",  label: "HIGH-YIELD SAVINGS", balance: 0,   apyBps: 425 },
  { kind: "vault",    label: "GOLD VAULT",          balance: 0,   apyBps: 0 },
] as const;

async function isPicassoOrgUser(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (isOwnerEmail(u?.email)) return true;
  return isActiveDeveloperOrgMember(userId);
}

// First-touch bank seed. Idempotent: only seeds when the player has no
// accounts yet. Picasso/owner/dev-org staff (detected by the passed-in email
// allow-list OR a DB-backed owner/dev-org lookup) get the staff seed; everyone
// else gets the lean starter grant.
async function ensureSeeded(userId: string, email?: string | null): Promise<BankAccount[]> {
  const existing = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  if (existing.length > 0) return existing;
  const picasso = isPicassoOrgMemberEmail(email) || (await isPicassoOrgUser(userId));
  const defs = picasso ? STAFF_SEED_DEFS : STARTER_SEED_DEFS;
  const inserted = await db
    .insert(bankAccountsTable)
    .values(defs.map((s) => ({ userId, kind: s.kind, label: s.label, balance: s.balance, apyBps: s.apyBps })))
    .returning();
  return inserted;
}

router.get("/economy/bank/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const accounts = await ensureSeeded(uid(req), emailOf(req));
  res.json({ accounts });
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

  const accounts = await ensureSeeded(userId, emailOf(req));
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
