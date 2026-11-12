import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, towerMarketHoldingsTable, towerMarketTradesTable } from "@workspace/db";
import {
  businessOfficeHours,
  getCityClock,
  getTowerBusinessPlacement,
  isOfficeOpenAt,
  officeHoursLabel,
  sortTowerBusinessesByExitPriority,
  towerBusinessByKey,
} from "@workspace/api-zod";
import { creditFiat, getSpendableFiat, spendFiat } from "../lib/fiat-wallet";

const router = Router();
const MAX_TRADE_SHARES = 1_000;

function requestedCity(req: Request): string {
  return typeof req.query.city === "string" && req.query.city.length <= 64 ? req.query.city : "minx_city";
}

function userId(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String(req.user.id);
}

function quoteFor(key: string, at = Date.now()) {
  const company = towerBusinessByKey(key);
  if (!company) return null;
  const bucket = Math.floor(at / (15 * 60 * 1000));
  const seed = [...company.ticker].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const movement = Math.sin(bucket * 0.37 + seed) * 0.07 + Math.sin(bucket * 0.11 + seed * 2) * 0.035;
  const priorMovement = Math.sin((bucket - 1) * 0.37 + seed) * 0.07 + Math.sin((bucket - 1) * 0.11 + seed * 2) * 0.035;
  const priceFiat = Math.max(1, Math.round(company.baseSharePriceFiat * (1 + movement)));
  const priorFiat = Math.max(1, Math.round(company.baseSharePriceFiat * (1 + priorMovement)));
  return { priceFiat, changePct: Number((((priceFiat - priorFiat) / priorFiat) * 100).toFixed(2)), quotedAt: new Date(at).toISOString() };
}

export function towerMarketQuote(key: string, at = Date.now()) {
  return quoteFor(key, at);
}

router.get("/tower-market/companies", async (_req, res) => {
  const held = await db
    .select({ companyKey: towerMarketHoldingsTable.companyKey, shares: sql<number>`coalesce(sum(${towerMarketHoldingsTable.shares}), 0)::int` })
    .from(towerMarketHoldingsTable)
    .groupBy(towerMarketHoldingsTable.companyKey);
  const heldByCompany = new Map(held.map((row) => [row.companyKey, Number(row.shares)]));
  res.json({
    issuer: "PABLO CORP / SHADOW CORP",
    market: "SHADOW TOWER EXCHANGE",
    companies: sortTowerBusinessesByExitPriority().map((company) => {
      const quote = quoteFor(company.key)!;
      const publicSharesHeld = heldByCompany.get(company.key) ?? 0;
      return {
        ...company,
        ...quote,
        officeHours: businessOfficeHours(company.key, company.category),
        placement: getTowerBusinessPlacement(company),
        publicSharesHeld,
        sharesAvailable: Math.max(0, company.publicFloatShares - publicSharesHeld),
      };
    }),
  });
});

// Public server-synchronised clock. It is intentionally not derived from the
// browser locale: a Huda floor must read Asia/Ho_Chi_Minh even when the player
// is visiting from another timezone.
router.get("/tower-market/clock", (req, res) => {
  const cityId = requestedCity(req);
  res.json(getCityClock(new Date(), cityId));
});

router.get("/tower-market/business-hours/:key", (req, res) => {
  const company = towerBusinessByKey(req.params.key);
  if (!company) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const cityId = requestedCity(req);
  const officeHours = businessOfficeHours(company.key, company.category);
  res.json({
    businessKey: company.key,
    cityId,
    ...officeHours,
    openNow: isOfficeOpenAt(new Date(), cityId, officeHours.profile),
  });
});

router.get("/tower-market/portfolio", async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const [holdings, trades, wallet] = await Promise.all([
    db.select().from(towerMarketHoldingsTable).where(eq(towerMarketHoldingsTable.userId, uid)),
    db.select().from(towerMarketTradesTable).where(eq(towerMarketTradesTable.userId, uid)).orderBy(desc(towerMarketTradesTable.createdAt)).limit(50),
    getSpendableFiat(uid),
  ]);
  const valued = holdings.map((holding) => {
    const company = towerBusinessByKey(holding.companyKey);
    const quote = quoteFor(holding.companyKey);
    return { ...holding, ticker: company?.ticker ?? "?", companyName: company?.name ?? holding.companyKey, priceFiat: quote?.priceFiat ?? 0, marketValueFiat: (quote?.priceFiat ?? 0) * holding.shares };
  });
  res.json({ holdings: valued, trades, wallet });
});

router.post("/tower-market/trade", async (req, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const companyKey = typeof req.body?.companyKey === "string" ? req.body.companyKey : "";
  const company = towerBusinessByKey(companyKey);
  const side = req.body?.side === "sell" ? "sell" : req.body?.side === "buy" ? "buy" : null;
  const shares = Number(req.body?.shares);
  const requestId = typeof req.body?.requestId === "string" ? req.body.requestId.slice(0, 80) : "";
  if (!company || !side) { res.status(400).json({ error: "Valid company and side required" }); return; }
  if (!Number.isInteger(shares) || shares < 1 || shares > MAX_TRADE_SHARES) { res.status(400).json({ error: `Shares must be 1-${MAX_TRADE_SHARES}` }); return; }
  if (requestId.length < 8) { res.status(400).json({ error: "Stable requestId required" }); return; }

  const quote = quoteFor(company.key)!;
  const cityId = requestedCity(req);
  const officeHours = businessOfficeHours(company.key, company.category);
  if (!isOfficeOpenAt(new Date(), cityId, officeHours.profile)) {
    res.status(409).json({
      error: "This Tower service is closed",
      businessKey: company.key,
      cityId,
      officeHours: officeHoursLabel(officeHours.profile),
      openNow: false,
    });
    return;
  }
  const totalFiat = quote.priceFiat * shares;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${company.key}), 42067)`);
    const [prior] = await tx.select().from(towerMarketTradesTable)
      .where(and(eq(towerMarketTradesTable.userId, uid), eq(towerMarketTradesTable.requestId, requestId))).limit(1);
    if (prior) return { status: 200, body: { ok: true, duplicate: true, trade: prior } };

    const [holding] = await tx.select().from(towerMarketHoldingsTable)
      .where(and(eq(towerMarketHoldingsTable.userId, uid), eq(towerMarketHoldingsTable.companyKey, company.key)))
      .for("update").limit(1);

    if (side === "buy") {
      const [{ issued }] = await tx.select({ issued: sql<number>`coalesce(sum(${towerMarketHoldingsTable.shares}), 0)::int` })
        .from(towerMarketHoldingsTable).where(eq(towerMarketHoldingsTable.companyKey, company.key));
      if (Number(issued) + shares > company.publicFloatShares) return { status: 409, body: { error: "Not enough public float available" } };
      const spent = await spendFiat(tx, { userId: uid, amountFiat: totalFiat, description: `BUY ${shares} ${company.ticker}`, kind: "tower_stock_buy", idempotencyKey: requestId });
      if (!spent.ok) return { status: 402, body: { error: spent.error, required: totalFiat, spendable: spent.spendable } };
      const oldShares = holding?.shares ?? 0;
      const newShares = oldShares + shares;
      const averageCostFiat = Math.round((((holding?.averageCostFiat ?? 0) * oldShares) + totalFiat) / newShares);
      await tx.insert(towerMarketHoldingsTable).values({ userId: uid, companyKey: company.key, shares: newShares, averageCostFiat })
        .onConflictDoUpdate({ target: [towerMarketHoldingsTable.userId, towerMarketHoldingsTable.companyKey], set: { shares: newShares, averageCostFiat, updatedAt: new Date() } });
    } else {
      if (!holding || holding.shares < shares) return { status: 409, body: { error: "Insufficient shares", held: holding?.shares ?? 0 } };
      const newShares = holding.shares - shares;
      await tx.update(towerMarketHoldingsTable).set({ shares: newShares, updatedAt: new Date() }).where(eq(towerMarketHoldingsTable.id, holding.id));
      await creditFiat(tx, { userId: uid, amountFiat: totalFiat, description: `SELL ${shares} ${company.ticker}`, kind: "tower_stock_sell", idempotencyKey: requestId });
    }
    const [trade] = await tx.insert(towerMarketTradesTable).values({ userId: uid, companyKey: company.key, ticker: company.ticker, side, shares, priceFiat: quote.priceFiat, totalFiat, requestId }).returning();
    return { status: 200, body: { ok: true, trade, quote } };
  });
  res.status(result.status).json(result.body);
});

export default router;