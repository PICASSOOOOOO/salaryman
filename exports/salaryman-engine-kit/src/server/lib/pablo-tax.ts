import {
  db,
  pabloTaxMeterTable,
  pabloTaxLineItemsTable,
  pabloTaxInvoicesTable,
  playerLedgerTable,
  bankAccountsTable,
  salarymanSavesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { spendFiat } from "./fiat-wallet";

/**
 * Pablo Tax engine.
 *
 * Every API call we run on a user's behalf is charged here at a 300%
 * markup ($1 cost → $4 charged). PABLO PRIME ($149/mo) is treated as a
 * pre-paid credit — Prime subscribers get the first $149 of marked-up
 * usage free per month. Once accruedCents - prepaid >= NEXT_BILL_THRESHOLD
 * ($20), we trigger the billing waterfall:
 *
 *   1. ƒ FIAT (in-game wallet, $1 = ƒ100) — only EARNED ƒ counts (the
 *      starting onboarding grant is quarantined, see player_ledger).
 *   2. Gold balance (in-game, $1 = 0.005 oz)
 *   3. USD via Stripe (requires saved payment method)
 *   4. BTC at spot rate (requires connected wallet — currently a stub)
 *
 * If the waterfall fails to cover a $20 increment (no funds anywhere),
 * the user is hard-blocked from further API features until they top up
 * or cancel the pending bill (we DO NOT silently extend credit — that
 * way lies the Sam Bankman-Fried ending).
 */

export const PABLO_TAX_MARKUP = 4; // 300% markup → 4× cost
export const PRIME_MONTHLY_BUDGET_CENTS = 14_900; // $149
export const NEXT_BILL_THRESHOLD_CENTS = 2_000; // $20 increments

// Conversion rates — keep in sync with client. $1 = ƒ100 = 0.1 GOLD.
export const USD_PER_FIAT_CENTS = 1; // ƒ1 = $0.01 = 1¢ → 100¢ ⇒ ƒ100
export const FIAT_PER_USD = 100;
export const GOLD_OZ_PER_USD = 0.1;

export type ApiKind = "image" | "music" | "chat" | "bot" | "voice" | "sms" | "stripe" | "tax" | "other";

/**
 * If a caller passes a requestId twice (network retry, double-fire from a
 * client) we short-circuit on the second call and return the original
 * charge result instead of double-billing. Implemented via a lookup on the
 * `request_id` column in `pablo_tax_line_items`. Callers who omit a
 * requestId opt out of idempotency entirely.
 */

export type ChargeResult = {
  charged: boolean;
  reason?: string;
  // Amount actually billed in this call (cents) — usually 0 unless we
  // crossed a $20 increment and the waterfall succeeded.
  billedCents: number;
  // Updated meter snapshot.
  meter: {
    accruedCents: number;
    billedCents: number;
    primeActive: boolean;
    period: string;
  };
};

function periodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getOrCreateMeter(userId: string) {
  const period = periodKey();
  const rows = await db.select().from(pabloTaxMeterTable).where(eq(pabloTaxMeterTable.userId, userId)).limit(1);
  if (rows[0]) {
    // Roll the period if we crossed a month boundary.
    if (rows[0].periodYearMonth !== period) {
      const [rolled] = await db.update(pabloTaxMeterTable)
        .set({ periodYearMonth: period, accruedCents: 0, billedCents: 0 })
        .where(eq(pabloTaxMeterTable.userId, userId))
        .returning();
      return rolled;
    }
    return rows[0];
  }
  const [created] = await db.insert(pabloTaxMeterTable)
    .values({ userId, periodYearMonth: period })
    .returning();
  return created;
}

/**
 * Charge the user for one API call. Records a line item, advances the
 * accumulator, and (if we crossed a $20 increment) attempts to bill via
 * the waterfall. Idempotency is the caller's responsibility — pass a
 * unique `metadata.requestId` if you need replay protection.
 */
/**
 * Returns 0.9 if the player has the Tax Strategist skill (10% Pablo Tax
 * reduction), 1.0 otherwise. Checks any save slot for the given user.
 * Best-effort — network/DB errors silently fall back to 1.0.
 */
export async function getSkillTaxFactor(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, userId))
      .limit(5);
    for (const row of rows) {
      const skills = (row.data as Record<string, unknown>)?.skills;
      if (Array.isArray(skills) && skills.includes("business.tax_strategist")) return 0.9;
    }
  } catch { /* best-effort */ }
  return 1.0;
}

export async function chargePabloTax(opts: {
  userId: string;
  kind: ApiKind;
  label: string;
  costBasisCents: number;
  /** Optional idempotency key. If a row with this `request_id` already
   * exists for this user, we short-circuit and return the meter as-is. */
  requestId?: string;
  /** Optional cost multiplier — pass result of getSkillTaxFactor() to apply
   *  the Tax Strategist skill discount (0.9 = 10% off) without an extra DB
   *  round-trip inside this function. */
  costBasisMultiplier?: number;
  metadata?: Record<string, unknown>;
}): Promise<ChargeResult> {
  const period = periodKey();
  const taxFactor = opts.costBasisMultiplier ?? await getSkillTaxFactor(opts.userId);
  const effectiveBasis = Math.round(opts.costBasisCents * taxFactor);
  const charged = Math.max(0, Math.round(effectiveBasis * PABLO_TAX_MARKUP));

  // Idempotency check (cheap pre-flight outside the tx — the unique-by-row
  // path inside the tx is the real guard, but the early return saves us
  // a lock on hot retries).
  if (opts.requestId) {
    const dup = await db.select({ id: pabloTaxLineItemsTable.id })
      .from(pabloTaxLineItemsTable)
      .where(and(
        eq(pabloTaxLineItemsTable.userId, opts.userId),
        eq(pabloTaxLineItemsTable.requestId, opts.requestId),
      ))
      .limit(1);
    if (dup[0]) {
      const snap = await getPabloTaxSnapshot(opts.userId);
      return {
        charged: false,
        reason: "IDEMPOTENT_REPLAY",
        billedCents: 0,
        meter: { accruedCents: snap.accruedCents, billedCents: snap.billedCents, primeActive: snap.primeActive, period: snap.period },
      };
    }
  }

  // SINGLE TRANSACTION covers: lock meter → record line item → bump
  // accrual → decide if waterfall fires → run waterfall (also inside tx
  // so the bank-row locks compose with the meter lock) → bump billedCents
  // exactly once. This eliminates the lost-update race the prior version
  // had where billedCents was written from a stale snapshot.
  const result = await db.transaction(async (tx) => {
    // 1) Lock + roll meter.
    const existing = await tx.select().from(pabloTaxMeterTable)
      .where(eq(pabloTaxMeterTable.userId, opts.userId))
      .for("update")
      .limit(1);
    let row = existing[0];
    if (!row) {
      const [created] = await tx.insert(pabloTaxMeterTable)
        .values({ userId: opts.userId, periodYearMonth: period })
        .onConflictDoNothing({ target: pabloTaxMeterTable.userId })
        .returning();
      // If a parallel insert beat us, re-read with the lock.
      row = created ?? (await tx.select().from(pabloTaxMeterTable)
        .where(eq(pabloTaxMeterTable.userId, opts.userId))
        .for("update").limit(1))[0];
    }
    if (row.periodYearMonth !== period) {
      const [rolled] = await tx.update(pabloTaxMeterTable)
        .set({ periodYearMonth: period, accruedCents: 0, billedCents: 0 })
        .where(eq(pabloTaxMeterTable.userId, opts.userId))
        .returning();
      row = rolled;
    }

    // 2) Idempotency re-check inside tx (defends against the race where
    //    two concurrent calls both passed the outer pre-flight check).
    if (opts.requestId) {
      const dupInTx = await tx.select({ id: pabloTaxLineItemsTable.id })
        .from(pabloTaxLineItemsTable)
        .where(and(
          eq(pabloTaxLineItemsTable.userId, opts.userId),
          eq(pabloTaxLineItemsTable.requestId, opts.requestId),
        ))
        .limit(1);
      if (dupInTx[0]) {
        return { meter: row, billedThisCall: 0, replay: true };
      }
    }

    // 3) Record line item + bump accrual.
    await tx.insert(pabloTaxLineItemsTable).values({
      userId: opts.userId,
      periodYearMonth: period,
      kind: opts.kind,
      label: opts.label.slice(0, 96),
      costBasisCents: opts.costBasisCents,
      chargedCents: charged,
      requestId: opts.requestId ?? null,
      metadata: (opts.metadata as object) ?? null,
    });
    const newAccrued = row.accruedCents + charged;

    // 4) Compute owed using freshly-locked numbers — no stale snapshot.
    const prepaid = row.primeActive ? PRIME_MONTHLY_BUDGET_CENTS : 0;
    const owed = Math.max(0, newAccrued - prepaid - row.billedCents);
    let billedThisCall = 0;
    let newBilledTotal = row.billedCents;

    if (owed >= NEXT_BILL_THRESHOLD_CENTS) {
      const incrementsDue = Math.floor(owed / NEXT_BILL_THRESHOLD_CENTS);
      const toBill = incrementsDue * NEXT_BILL_THRESHOLD_CENTS;
      // Waterfall runs INSIDE the tx so its bank-row locks share the
      // same transaction boundary as the meter lock.
      billedThisCall = await runBillingWaterfallTx(tx, { userId: opts.userId, amountCents: toBill, period });
      newBilledTotal = row.billedCents + billedThisCall;
    }

    // 5) Single write of accrued + billed under the held lock.
    const [updated] = await tx.update(pabloTaxMeterTable)
      .set({
        accruedCents: newAccrued,
        billedCents: newBilledTotal,
        lastChargedAt: new Date(),
      })
      .where(eq(pabloTaxMeterTable.userId, opts.userId))
      .returning();
    return { meter: updated, billedThisCall, replay: false };
  });

  if (result.replay) {
    return {
      charged: false,
      reason: "IDEMPOTENT_REPLAY",
      billedCents: 0,
      meter: { accruedCents: result.meter.accruedCents, billedCents: result.meter.billedCents, primeActive: !!result.meter.primeActive, period: result.meter.periodYearMonth },
    };
  }
  return {
    charged: true,
    billedCents: result.billedThisCall,
    meter: {
      accruedCents: result.meter.accruedCents,
      billedCents: result.meter.billedCents,
      primeActive: !!result.meter.primeActive,
      period: result.meter.periodYearMonth,
    },
  };
}

/**
 * Billing waterfall: try ƒ → gold → Stripe → BTC in order. Returns the
 * total cents successfully billed (may be < amountCents if all sources
 * are exhausted). Each successful slice writes a row in pablo_tax_invoices.
 *
 * Stripe + BTC paths are stubs that return 0 here — they must be wired
 * to actual payment processors (the Stripe one needs a saved
 * PaymentMethod; the BTC one needs a connected wallet provider). The
 * waterfall is structured so adding them later is a single function swap.
 */
/**
 * Internal — runs entirely inside an existing transaction so the bank-row
 * + meter-row locks compose. Never call this from outside a tx.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function runBillingWaterfallTx(tx: Tx, opts: { userId: string; amountCents: number; period: string }): Promise<number> {
  let remaining = opts.amountCents;
  let billed = 0;

  // 1) ƒ FIAT — only EARNED ƒ counts; quarantined starting balance is excluded.
  if (remaining > 0) {
    const drawn = await drawFromFiatTx(tx, { userId: opts.userId, amountCents: remaining });
    if (drawn > 0) {
      await tx.insert(pabloTaxInvoicesTable).values({
        userId: opts.userId, periodYearMonth: opts.period,
        source: "fiat", amountCents: drawn, status: "paid", paidAt: new Date(),
      });
      billed += drawn;
      remaining -= drawn;
    }
  }
  // 2-4) gold/stripe/btc are stubs. Dedupe pending invoices so a stuck user
  //      doesn't accumulate dozens of identical $20 PENDING rows on retries
  //      — we only write one open Stripe pending row per user/period at a time.
  if (remaining > 0) {
    const existingPending = await tx.select({ id: pabloTaxInvoicesTable.id, amountCents: pabloTaxInvoicesTable.amountCents })
      .from(pabloTaxInvoicesTable)
      .where(and(
        eq(pabloTaxInvoicesTable.userId, opts.userId),
        eq(pabloTaxInvoicesTable.periodYearMonth, opts.period),
        eq(pabloTaxInvoicesTable.status, "pending"),
        eq(pabloTaxInvoicesTable.source, "stripe"),
      ))
      .limit(1);
    if (existingPending[0]) {
      await tx.update(pabloTaxInvoicesTable)
        .set({ amountCents: existingPending[0].amountCents + remaining })
        .where(eq(pabloTaxInvoicesTable.id, existingPending[0].id));
    } else {
      await tx.insert(pabloTaxInvoicesTable).values({
        userId: opts.userId, periodYearMonth: opts.period,
        source: "stripe", amountCents: remaining, status: "pending",
      });
    }
  }
  return billed;
}

/**
 * Pull `amountCents` worth of EARNED ƒ from the user's bank accounts.
 * Quarantined starting ƒ is protected: we never draw the bank below the
 * quarantine line. Highest-balance account is drawn first.
 */
async function drawFromFiatTx(tx: Tx, opts: { userId: string; amountCents: number }): Promise<number> {
  const fiatNeeded = Math.ceil(opts.amountCents * FIAT_PER_USD / 100); // cents → ƒ
  const [led] = await tx.select().from(playerLedgerTable)
    .where(eq(playerLedgerTable.userId, opts.userId))
    .for("update")
    .limit(1);
  const quarantine = led?.quarantineFiat ?? 0;

  const accounts = await tx.select().from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, opts.userId), eq(bankAccountsTable.currency, "FIAT")))
    .for("update");
  const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const spendable = Math.max(0, total - quarantine);
  const toDraw = Math.min(fiatNeeded, spendable);
  if (toDraw <= 0) return 0;

  let remaining = toDraw;
  const sorted = [...accounts].sort((a, b) => (b.balance || 0) - (a.balance || 0));
  for (const acct of sorted) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, acct.balance);
    if (slice <= 0) continue;
    await tx.update(bankAccountsTable)
      .set({ balance: acct.balance - slice, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, acct.id));
    remaining -= slice;
  }
  const drawnFiat = toDraw - remaining;
  return Math.floor((drawnFiat * 100) / FIAT_PER_USD);
}

/**
 * Read-only snapshot for the wallet/nav UI. Returns the meter state plus
 * derived "owed now" and "free remaining" numbers.
 */
export async function getPabloTaxSnapshot(userId: string) {
  const meter = await getOrCreateMeter(userId);
  const prepaid = meter.primeActive ? PRIME_MONTHLY_BUDGET_CENTS : 0;
  const owedCents = Math.max(0, meter.accruedCents - prepaid - meter.billedCents);
  const primeRemainingCents = meter.primeActive ? Math.max(0, PRIME_MONTHLY_BUDGET_CENTS - meter.accruedCents) : 0;
  return {
    period: meter.periodYearMonth,
    primeActive: !!meter.primeActive,
    accruedCents: meter.accruedCents,
    billedCents: meter.billedCents,
    owedCents,
    primeBudgetCents: PRIME_MONTHLY_BUDGET_CENTS,
    primeRemainingCents,
    nextBillIncrementCents: NEXT_BILL_THRESHOLD_CENTS,
    markupMultiplier: PABLO_TAX_MARKUP,
  };
}

/**
 * Preflight budget gate for paid API features. Enforces the "$20 increment
 * hard-block" the billing model promises: a non-Prime user who has already
 * accrued >= one unpaid $20 increment (the waterfall couldn't cover it from
 * earned ƒ / gold / Stripe) is blocked from kicking off MORE paid calls
 * until they top up, settle, or upgrade. Prime users (prepaid $149/mo) and
 * solvent users always pass.
 *
 * This is the AWAITED pre-check that must run BEFORE an expensive provider
 * call — chargePabloTax records cost AFTER the fact, so on its own it can't
 * stop a broke user from getting one more expensive result per request.
 */
export async function canUseApiFeatures(userId: string): Promise<{ allowed: boolean; reason?: string; owedCents: number }> {
  const snap = await getPabloTaxSnapshot(userId);
  if (snap.primeActive) return { allowed: true, owedCents: snap.owedCents };
  if (snap.owedCents >= NEXT_BILL_THRESHOLD_CENTS) {
    return {
      allowed: false,
      reason: "Outstanding Pablo Tax balance. Settle your bill or upgrade to PABLO PRIME to keep using AI features.",
      owedCents: snap.owedCents,
    };
  }
  return { allowed: true, owedCents: snap.owedCents };
}

/**
 * Compute USD-equivalent of a ƒ amount. Used by the wallet UI to render
 * balances in any currency. Returns dollars (not cents) for readability.
 */
export function fiatToUsd(fiat: number): number {
  return fiat / FIAT_PER_USD;
}

/**
 * Internal helper for the Stripe webhook to flip Prime on/off.
 */
export async function setPrimeActive(userId: string, active: boolean) {
  const period = periodKey();
  await db.insert(pabloTaxMeterTable)
    .values({ userId, periodYearMonth: period, primeActive: active ? 1 : 0 })
    .onConflictDoUpdate({
      target: pabloTaxMeterTable.userId,
      set: { primeActive: active ? 1 : 0 },
    });
}

/**
 * Spend guard for in-game ƒ feature purchases (NOT Pablo Tax — that flows
 * through chargePabloTax). Refuses to allow a charge that would draw
 * against the quarantined starting balance. Returns true on success;
 * false if there isn't enough EARNED ƒ to cover the cost.
 *
 * Use this from anywhere a feature deducts ƒ for non-API gameplay (gear,
 * vehicles, cosmetics priced in ƒ). The quarantine line is the user's
 * defence against burning their tutorial money on the AI features that
 * are supposed to require either Prime or real cash.
 */
export async function spendEarnedFiat(opts: { userId: string; amountFiat: number; description: string }): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; spendable: number }> {
  return db.transaction(async (tx) => spendFiat(tx, opts));
}
