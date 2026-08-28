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
  { kind: "checking", label: "STANDARD CHECKING", balance: STARTER_CHECKING_BALANCE, apyBps: 0 },
  { kind: "savings", label: "HIGH-YIELD SAVINGS", balance: 0, apyBps: 425 },
  { kind: "vault", label: "GOLD VAULT", balance: 0, apyBps: 0 },
];
const STAFF_FIAT_ACCOUNT_SEEDS: readonly FiatAccountSeed[] = [
  { kind: "checking", label: "STANDARD CHECKING", balance: PICASSO_START_FIAT, apyBps: 0 },
  { kind: "savings", label: "HIGH-YIELD SAVINGS", balance: 48_000, apyBps: 425 },
  { kind: "vault", label: "GOLD VAULT", balance: 80_000, apyBps: 0 },
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
  if (!selectedSeeds) {
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const staff = isOwnerEmail(user?.email)
      || isPicassoOrgMemberEmail(user?.email)
      || await isActiveDeveloperOrgMember(userId);
    selectedSeeds = staff ? STAFF_FIAT_ACCOUNT_SEEDS : DEFAULT_FIAT_ACCOUNT_SEEDS;
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), 41001)`);
  const existing = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
  if (existing.length > 0) return existing;
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
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT")))
    .for("update");
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
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
  for (const account of [...accounts].sort((a, b) => b.balance - a.balance)) {
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
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT"))).for("update");
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const marker = opts.idempotencyKey ? `[request:${opts.idempotencyKey}]` : "";
  const description = marker ? `${opts.description.slice(0, 150)} ${marker}` : opts.description.slice(0, 200);
  if (marker) {
    const prior = await tx.select({ id: bankTransactionsTable.id }).from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.userId, opts.userId), eq(bankTransactionsTable.description, description))).limit(1);
    if (prior.length > 0) {
      return { ok: true, newBalance: total, spendable: Math.max(0, total - (ledger?.quarantineFiat ?? 0)), duplicate: true };
    }
  }
  const account = accounts.find((row) => row.kind === "checking") ?? accounts[0];
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
    const balance = accounts
      .filter((account) => account.currency === "FIAT")
      .reduce((sum, account) => sum + account.balance, 0);
    return { balance, spendable: Math.max(0, balance - (ledgers[0]?.quarantineFiat ?? 0)) };
  });
}