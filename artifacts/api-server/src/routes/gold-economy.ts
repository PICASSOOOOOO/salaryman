import { Router, type Request, type Response } from "express";
import {
  db,
  goldConversionQuotesTable,
  goldConversionTransactionsTable,
  playerGoldAccountsTable,
} from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { creditFiat, getSpendableFiat, spendFiat } from "../lib/fiat-wallet";
import {
  buildGoldQuote,
  btcForOneUsd,
  GOLD_CONVERSION_FEE_BPS,
  GOLD_QUOTE_TTL_MS,
  isFreshExecutableMarket,
} from "../lib/gold-economy";
import { getMarketIndex } from "./real-estate";

const router = Router();
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,128}$/;
const QUOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

function readSlot(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isSafeInteger(n) && n >= 0 && n <= 99 ? n : null;
}

async function ensureGoldAccount(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], uid: string, slot: number) {
  await tx.insert(playerGoldAccountsTable).values({ userId: uid, slotIndex: slot }).onConflictDoNothing();
  const [account] = await tx.select().from(playerGoldAccountsTable)
    .where(and(eq(playerGoldAccountsTable.userId, uid), eq(playerGoldAccountsTable.slotIndex, slot)))
    .for("update").limit(1);
  if (!account) throw new Error("Gold account unavailable");
  return account;
}

function publicMarket(market: Awaited<ReturnType<typeof getMarketIndex>>) {
  return {
    status: market.status,
    source: market.source,
    asOf: market.asOf,
    btcUsd: market.btcUsd || null,
    btcPerUsd: btcForOneUsd(market.btcUsd),
    goldSpotUsd: market.goldUsd,
    goldSpotSource: market.goldSource,
    goldSpotAsOf: market.goldAsOf,
  };
}

router.get("/economy/gold", async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const slot = readSlot(req.query.slot);
  if (slot == null) return void res.status(400).json({ error: "Invalid slot" });
  const [account, transactions, wallet, market] = await Promise.all([
    db.transaction((tx) => ensureGoldAccount(tx, uid, slot)),
    db.select().from(goldConversionTransactionsTable)
      .where(and(eq(goldConversionTransactionsTable.userId, uid), eq(goldConversionTransactionsTable.slotIndex, slot)))
      .orderBy(desc(goldConversionTransactionsTable.createdAt)).limit(100),
    getSpendableFiat(uid),
    getMarketIndex(),
  ]);
  res.json({
    slot,
    fiatBalance: wallet.balance,
    spendableFiat: wallet.spendable,
    goldTenths: account.balanceTenths,
    gold: account.balanceTenths / 10,
    base: { usd: 1, fiat: 100, gold: 0.1, fiatPerGold: 1000 },
    feeBps: GOLD_CONVERSION_FEE_BPS,
    quoteTtlMs: GOLD_QUOTE_TTL_MS,
    market: publicMarket(market),
    transactions,
  });
});

router.post("/economy/gold/quote", async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const slot = readSlot(req.body?.slot);
  const side = req.body?.side === "buy" || req.body?.side === "sell" ? req.body.side : null;
  const goldTenths = Number(req.body?.goldTenths);
  if (slot == null || !side || !Number.isSafeInteger(goldTenths) || goldTenths <= 0) {
    return void res.status(400).json({ error: "slot, side, and positive integer goldTenths are required" });
  }
  const market = await getMarketIndex();
  if (!isFreshExecutableMarket(market)) {
    return void res.status(503).json({ error: "Live BTC market unavailable; conversion disabled", market: publicMarket(market) });
  }
  const amounts = buildGoldQuote(side, goldTenths);
  const expiresAt = new Date(Date.now() + GOLD_QUOTE_TTL_MS);
  const [quote] = await db.insert(goldConversionQuotesTable).values({
    userId: uid,
    slotIndex: slot,
    ...amounts,
    btcUsdCents: Math.round(market.btcUsd * 100),
    marketSource: market.source,
    marketAsOf: new Date(market.asOf),
    expiresAt,
  }).returning();
  res.json({
    quoteId: quote.id,
    expiresAt: expiresAt.toISOString(),
    ...amounts,
    gold: goldTenths / 10,
    market: publicMarket(market),
  });
});

router.post("/economy/gold/convert", async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const slot = readSlot(req.body?.slot);
  const quoteId = String(req.body?.quoteId ?? "");
  const idempotencyKey = String(req.body?.idempotencyKey ?? "");
  if (slot == null || !QUOTE_ID.test(quoteId) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return void res.status(400).json({ error: "Valid slot, quoteId, and idempotencyKey are required" });
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}), ${41002 + slot})`);
    const [prior] = await tx.select().from(goldConversionTransactionsTable)
      .where(and(
        eq(goldConversionTransactionsTable.userId, uid),
        eq(goldConversionTransactionsTable.slotIndex, slot),
        eq(goldConversionTransactionsTable.idempotencyKey, idempotencyKey),
      )).limit(1);
    if (prior) {
      return { type: "ok" as const, duplicate: true, transaction: prior };
    }
    const [quote] = await tx.select().from(goldConversionQuotesTable)
      .where(and(
        eq(goldConversionQuotesTable.id, quoteId),
        eq(goldConversionQuotesTable.userId, uid),
        eq(goldConversionQuotesTable.slotIndex, slot),
      )).for("update").limit(1);
    if (!quote) return { type: "missing" as const };
    if (quote.consumedAt) return { type: "consumed" as const };
    if (quote.expiresAt.getTime() <= Date.now()) return { type: "expired" as const };

    const account = await ensureGoldAccount(tx, uid, slot);
    let goldBalanceAfterTenths: number;
    let fiatDelta: number;
    if (quote.side === "buy") {
      const spend = await spendFiat(tx, {
        userId: uid,
        amountFiat: quote.settledFiat,
        description: `GOLD BUY ${quote.goldTenths / 10}`,
        kind: "gold_buy",
        idempotencyKey,
      });
      if (!spend.ok) return { type: "insufficient_fiat" as const, balance: spend.spendable };
      goldBalanceAfterTenths = account.balanceTenths + quote.goldTenths;
      fiatDelta = -quote.settledFiat;
    } else {
      if (account.balanceTenths < quote.goldTenths) {
        return { type: "insufficient_gold" as const, balanceTenths: account.balanceTenths };
      }
      goldBalanceAfterTenths = account.balanceTenths - quote.goldTenths;
      const credit = await creditFiat(tx, {
        userId: uid,
        amountFiat: quote.settledFiat,
        description: `GOLD SELL ${quote.goldTenths / 10}`,
        kind: "gold_sell",
        idempotencyKey,
      });
      fiatDelta = credit.ok ? quote.settledFiat : 0;
    }

    await tx.update(playerGoldAccountsTable)
      .set({ balanceTenths: goldBalanceAfterTenths, updatedAt: new Date() })
      .where(and(eq(playerGoldAccountsTable.userId, uid), eq(playerGoldAccountsTable.slotIndex, slot)));
    const [transaction] = await tx.insert(goldConversionTransactionsTable).values({
      userId: uid,
      slotIndex: slot,
      quoteId: quote.id,
      idempotencyKey,
      side: quote.side,
      goldDeltaTenths: quote.side === "buy" ? quote.goldTenths : -quote.goldTenths,
      fiatDelta,
      feeFiat: quote.feeFiat,
      goldBalanceAfterTenths,
    }).returning();
    await tx.update(goldConversionQuotesTable)
      .set({ consumedAt: new Date(), executionIdempotencyKey: idempotencyKey })
      .where(and(eq(goldConversionQuotesTable.id, quote.id), isNull(goldConversionQuotesTable.consumedAt)));
    return { type: "ok" as const, duplicate: false, transaction };
  });

  if (result.type === "missing") return void res.status(404).json({ error: "Quote not found" });
  if (result.type === "consumed") return void res.status(409).json({ error: "Quote already used" });
  if (result.type === "expired") return void res.status(409).json({ error: "Quote expired" });
  if (result.type === "insufficient_fiat") return void res.status(409).json({ error: "Insufficient FIAT", spendableFiat: result.balance });
  if (result.type === "insufficient_gold") return void res.status(409).json({ error: "Insufficient GOLD", gold: result.balanceTenths / 10 });
  const wallet = await getSpendableFiat(uid);
  res.json({
    ok: true,
    duplicate: result.duplicate,
    fiatBalance: wallet.balance,
    goldTenths: result.transaction.goldBalanceAfterTenths,
    gold: result.transaction.goldBalanceAfterTenths / 10,
    transaction: result.transaction,
  });
});

export default router;