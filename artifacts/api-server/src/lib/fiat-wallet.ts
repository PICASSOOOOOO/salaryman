import { and, eq, sql } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  playerLedgerTable,
  usersTable,
} from "@workspace/db";
import { isActiveDeveloperOrgMember, isOwnerEmail, isPicassoOrgMemberEmail, PICASSO_START_FIAT } from "./plan";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type FiatAccountSeed = {
  kind: string;
  label: string;
  balance: number;
  apyBps: number;
};

export const STARTER_CHECKING_BALANCE = 200_000;
export const DEFAULT_FIAT_ACCOUNT_SEEDS: readonly FiatAccountSeed[] = [
  { kind: "cash", label: "CASH WALLET", balance: STARTER_CHECKING_BALANCE, apyBps: 0 },
];
const STAFF_FIAT_ACCOUNT_SEEDS: readonly FiatAccountSeed[] = [
  { kind: "cash", label: "CASH WALLET", balance: PICASSO_START_FIAT + 48_000 + 80_000, apyBps: 0 },
];

export type FiatSpendResult =
  | { ok: true; newBalance: number; spendable: number; duplicate?: boolean }
  | { ok: false; error: string; spendable: number };
export type FiatCreditResult = { ok: true; newBalance: number; spendable: number; duplicate?: boolean };

export async function ensureFiatAccounts(
  tx: Tx,
  userId: string,
  seeds?: readonly FiatAccountSeed[],
) {
  let selectedSeeds = seeds;
  let staffSeed = false;
  if (!selectedSeeds) {
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const staff = isOwnerEmail(user?.email)
      || isPicassoOrgMemberEmail(user?.email)
      || await isActiveDeveloperOrgMember(userId);
    staffSeed = staff;
    selectedSeeds = staff ? STAFF_FIAT_ACCOUNT_SEEDS : DEFAULT_FIAT_ACCOUNT_SEEDS;
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 41001)`);
  const existing = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  if (existing.length > 0) {
    // Before user-opened accounts existed, first touch created a checking
    // account, APY savings, and a gold vault. Collapse only that exact legacy
    // seed into cash; never rewrite an account the user named themselves.
    const legacyLabels = new Set(["STANDARD CHECKING", "HIGH-YIELD SAVINGS", "GOLD VAULT"]);
    if (!existing.some((row) => row.kind === "cash") && existing.every((row) => legacyLabels.has(row.label))) {
      const cashBalance = existing.reduce((sum, row) => sum + row.balance, 0);
      const [cash] = await tx
        .update(bankAccountsTable)
        .set({ kind: "cash", label: "CASH WALLET", balance: cashBalance, apyBps: 0, accountNumber: null, updatedAt: new Date() })
        .where(and(eq(bankAccountsTable.id, existing[0].id), eq(bankAccountsTable.userId, userId)))
        .returning();
      await tx.delete(bankAccountsTable).where(and(eq(bankAccountsTable.userId, userId), sql`${bankAccountsTable.id} <> ${existing[0].id}`));
      return cash ? [cash] : [];
    }
    // A Picasso/admin account can have been touched once by an older client
    // before the staff wallet seed existed. Upgrade that exact starter wallet
    // once, but never refill an admin who has already spent from it.
    if (staffSeed && existing.length === 1 && existing[0].kind === "cash" && existing[0].balance === STARTER_CHECKING_BALANCE) {
      const target = STAFF_FIAT_ACCOUNT_SEEDS.reduce((sum, seed) => sum + seed.balance, 0);
      const amount = target - existing[0].balance;
      if (amount > 0) {
        const balanceAfter = existing[0].balance + amount;
        const [updated] = await tx.update(bankAccountsTable)
          .set({ balance: balanceAfter, updatedAt: new Date() })
          .where(and(eq(bankAccountsTable.id, existing[0].id), eq(bankAccountsTable.userId, userId)))
          .returning();
        await tx.insert(bankTransactionsTable).values({
          userId,
          accountId: existing[0].id,
          kind: "admin_grant",
          description: "PICASSO ADMIN STARTER WALLET UPGRADE",
          amount,
          balanceAfter,
        });
        return updated ? [updated] : existing;
      }
    }
    return existing;
  }
  return tx
    .insert(bankAccountsTable)
    .values(selectedSeeds.map((seed) => ({ userId, ...seed })))
    .returning();
}

export async function spendFiat(
  tx: Tx,
  opts: { userId: string; amountFiat: number; description: string; kind?: string; idempotencyKey?: string },
): Promise<FiatSpendResult> {
  if (!Number.isInteger(opts.amountFiat) || opts.amountFiat <= 0) {
    throw new Error("amountFiat must be a positive integer");
  }

  await ensureFiatAccounts(tx, opts.userId);
  await tx.insert(playerLedgerTable).values({ userId: opts.userId }).onConflictDoNothing();
  const [ledger] = await tx
    .select()
    .from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, opts.userId))
    .for("update")
    .limit(1);
  const accounts = await tx
    .select()
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT"), eq(bankAccountsTable.kind, "cash")))
    .for("update");
  // Compatibility for isolated test fixtures that insert a checking row
  // directly instead of running wallet initialization.
  const spendAccounts = accounts.length > 0 ? accounts : await tx.select().from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT"))).for("update");
  const total = spendAccounts.reduce((sum, account) => sum + account.balance, 0);
  const spendable = Math.max(0, total - (ledger?.quarantineFiat ?? 0));
  const marker = opts.idempotencyKey ? `[request:${opts.idempotencyKey}]` : "";
  if (marker) {
    const prior = await tx
      .select({ id: bankTransactionsTable.id })
      .from(bankTransactionsTable)
      .where(and(
        eq(bankTransactionsTable.userId, opts.userId),
        eq(bankTransactionsTable.description, `${opts.description.slice(0, 150)} ${marker}`),
      ))
      .limit(1);
    if (prior.length > 0) return { ok: true, newBalance: total, spendable, duplicate: true };
  }
  if (spendable < opts.amountFiat) {
    return { ok: false, error: "Insufficient spendable FIAT balance", spendable };
  }

  let remaining = opts.amountFiat;
  let newBalance = total;
  for (const account of [...spendAccounts].sort((a, b) => b.balance - a.balance)) {
    if (remaining <= 0) break;
    const debit = Math.min(remaining, account.balance);
    if (debit <= 0) continue;
    const balanceAfter = account.balance - debit;
    await tx
      .update(bankAccountsTable)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, account.id));
    await tx.insert(bankTransactionsTable).values({
      userId: opts.userId,
      accountId: account.id,
      kind: opts.kind ?? "purchase",
      description: marker ? `${opts.description.slice(0, 150)} ${marker}` : opts.description.slice(0, 200),
      amount: -debit,
      balanceAfter,
    });
    remaining -= debit;
    newBalance -= debit;
  }

  return { ok: true, newBalance, spendable: spendable - opts.amountFiat };
}

/** Credit the server wallet inside the caller's transaction.
 * The idempotency marker is deliberately shared with spendFiat: callers must
 * provide a stable key for retried gameplay actions.
 */
export async function creditFiat(
  tx: Tx,
  opts: { userId: string; amountFiat: number; description: string; kind?: string; idempotencyKey?: string },
): Promise<FiatCreditResult> {
  if (!Number.isInteger(opts.amountFiat) || opts.amountFiat <= 0) {
    throw new Error("amountFiat must be a positive integer");
  }
  await ensureFiatAccounts(tx, opts.userId);
  await tx.insert(playerLedgerTable).values({ userId: opts.userId }).onConflictDoNothing();
  const [ledger] = await tx.select().from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, opts.userId)).for("update").limit(1);
  const accounts = await tx.select().from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT"), eq(bankAccountsTable.kind, "cash"))).for("update");
  const creditAccounts = accounts.length > 0 ? accounts : await tx.select().from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT"))).for("update");
  const total = creditAccounts.reduce((sum, account) => sum + account.balance, 0);
  const marker = opts.idempotencyKey ? `[request:${opts.idempotencyKey}]` : "";
  const description = marker ? `${opts.description.slice(0, 150)} ${marker}` : opts.description.slice(0, 200);
  if (marker) {
    const prior = await tx.select({ id: bankTransactionsTable.id }).from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.userId, opts.userId), eq(bankTransactionsTable.description, description))).limit(1);
    if (prior.length > 0) {
      return { ok: true, newBalance: total, spendable: Math.max(0, total - (ledger?.quarantineFiat ?? 0)), duplicate: true };
    }
  }
  const account = creditAccounts.find((row) => row.kind === "cash") ?? creditAccounts.find((row) => row.kind === "checking") ?? creditAccounts[0];
  if (!account) throw new Error("FIAT account missing after initialization");
  const balanceAfter = account.balance + opts.amountFiat;
  await tx.update(bankAccountsTable).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(bankAccountsTable.id, account.id));
  await tx.insert(bankTransactionsTable).values({
    userId: opts.userId, accountId: account.id, kind: opts.kind ?? "credit",
    description, amount: opts.amountFiat, balanceAfter,
  });
  const newBalance = total + opts.amountFiat;
  return { ok: true, newBalance, spendable: Math.max(0, newBalance - (ledger?.quarantineFiat ?? 0)) };
}

export async function getSpendableFiat(userId: string): Promise<{ balance: number; spendable: number }> {
  return db.transaction(async (tx) => {
    const accounts = await ensureFiatAccounts(tx, userId);
    const ledgers = await tx
      .select({ quarantineFiat: playerLedgerTable.quarantineFiat })
      .from(playerLedgerTable)
      .where(eq(playerLedgerTable.userId, userId))
      .limit(1);
    const cashAccounts = accounts.filter((account) => account.currency === "FIAT" && account.kind === "cash");
    const spendAccounts = cashAccounts.length > 0 ? cashAccounts : accounts.filter((account) => account.currency === "FIAT");
    const balance = spendAccounts
      .reduce((sum, account) => sum + account.balance, 0);
    return { balance, spendable: Math.max(0, balance - (ledgers[0]?.quarantineFiat ?? 0)) };
  });
}