import { Router, type Request, type Response } from "express";
import { sql, inArray } from "drizzle-orm";
import { db, bankAccountsTable, usersTable } from "@workspace/db";
import { claimSalary } from "../lib/salary";
import { claimVerifiedSalary } from "../lib/verified-salary";
import { FIAT_PER_USD } from "../lib/pablo-tax";

const router = Router();

// GET /api/economy/stats — public, lightweight world snapshot
//
// Drives the GAME → ECONOMY page (and any other "state of the world" UI we
// want to bolt on later). Cheap aggregate over bank_accounts so we can ship
// a live ledger without building a separate ETL. Names are sanitized to
// avoid leaking real emails — first name only, falling back to a masked
// handle. Bountied count is currently a stub field (always 0) so the front
// end can render the slot now and we can fill it in once the bounty system
// lands. Cached in-process for 30s so a chatty client can't hammer the DB.
type Stats = {
  totalCirculation: number;
  accountCount: number;
  userCount: number;
  richest: { name: string; total: number }[];
  poorest: { name: string; total: number }[];
  bountiedCount: number;
  asOf: number;
};

const CACHE_TTL_MS = 30_000;
let cache: Stats | null = null;

async function compute(): Promise<Stats> {
  // Per-user totals across every account they own.
  const totals = await db
    .select({
      userId: bankAccountsTable.userId,
      total: sql<number>`COALESCE(SUM(${bankAccountsTable.balance}),0)::int`,
    })
    .from(bankAccountsTable)
    .groupBy(bankAccountsTable.userId);

  const totalCirculation = totals.reduce((s, r) => s + Number(r.total || 0), 0);
  const accountCountRow = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(bankAccountsTable);
  const accountCount = Number(accountCountRow[0]?.n || 0);

  // Look up display names for the top 5 + bottom 5
  const sortedDesc = [...totals].sort((a, b) => Number(b.total) - Number(a.total));
  const topIds = sortedDesc.slice(0, 5).map(r => r.userId);
  const botIds = sortedDesc.slice(-5).reverse().map(r => r.userId);
  const wantedIds = Array.from(new Set([...topIds, ...botIds]));

  // Public endpoint — surface display names, never PII. We only use a real
  // first name if the user set one; emails are NEVER derived from (no
  // local-part fallback) so we don't leak addresses through the leaderboard.
  // Anonymous users get a stable, non-identifying salaryman handle.
  const nameMap = new Map<string, string>();
  if (wantedIds.length > 0) {
    const rows = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName })
      .from(usersTable)
      .where(inArray(usersTable.id, wantedIds));
    for (const r of rows) {
      const fn = (r.firstName || "").trim();
      if (fn) nameMap.set(String(r.id), fn.slice(0, 24));
    }
  }
  const anonHandle = (userId: string) => `salaryman_${String(userId).slice(-4).padStart(4, "0")}`;
  const namedFor = (userId: string, total: number) => ({
    name: nameMap.get(userId) || anonHandle(userId),
    total: Number(total) || 0,
  });

  const richest = sortedDesc.slice(0, 5).map(r => namedFor(r.userId, r.total));
  const poorest = sortedDesc.slice(-5).reverse().map(r => namedFor(r.userId, r.total));

  return {
    totalCirculation,
    accountCount,
    userCount: totals.length,
    richest,
    poorest,
    bountiedCount: 0,
    asOf: Date.now(),
  };
}

router.get("/economy/stats", async (_req: Request, res: Response) => {
  try {
    if (cache && Date.now() - cache.asOf < CACHE_TTL_MS) {
      res.json(cache);
      return;
    }
    cache = await compute();
    res.json(cache);
  } catch (e: any) {
    console.error("[economy/stats]", e);
    res.status(500).json({ error: e?.message || "stats failed" });
  }
});

// POST /api/economy/salary/claim — compatibility wallet read for older clients.
// Unemployed and fictitious-business players receive no passive FIAT.
router.post("/economy/salary/claim", async (req: Request, res: Response) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = String((req.user as { id: string }).id);
  try {
    const result = await claimSalary(userId);
    res.json(result);
  } catch (e: any) {
    console.error("[economy/salary/claim]", e);
    res.status(500).json({ error: e?.message || "salary claim failed" });
  }
});

// POST /api/economy/verified-salary/claim — accrue + pay the player's VERIFIED
// real-world salary (monthlySalary/720 ƒ per REAL-world hour). Server-
// authoritative and safe to poll: pays only whole real hours, returns paid=0
// when nothing is owed (or the salary is not verified), and credits FIAT only
// (never Gold) so the credit can never be cashed out to real money. The HUD
// polls this and animates a floating "+ƒ" whenever `paid > 0`.
router.post("/economy/verified-salary/claim", async (req: Request, res: Response) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const userId = String((req.user as { id: string }).id);
  try {
    const result = await claimVerifiedSalary(userId);
    res.json(result);
  } catch (e: any) {
    console.error("[economy/verified-salary/claim]", e);
    res.status(500).json({ error: e?.message || "verified salary claim failed" });
  }
});

// ── GET /api/economy/markets ─────────────────────────────────────────────────
// Real-world market snapshot: forex (USD/EUR/JPY/GBP), stock indices
// (S&P 500, NASDAQ, Nikkei), and commodity spot prices (Gold, Oil).
// Each ticker also carries an `fiatImpact` line showing how the rate maps
// to in-game ƒ (using the canonical FIAT_PER_USD = 100 ƒ/$1 USD rate).
//
// Forex rates are fetched live from frankfurter.app (free, no API key).
// Stock indices and commodities are estimated (no free no-key real-time
// feed for those categories) and flagged with isEstimated: true.
// Results are cached in-process for 60 s to avoid hammering the external API.
// On any upstream error the last-known cached values are returned with
// isEstimated: true so the client always has something to render.

type ForexRate  = { pair: string; base: string; quote: string; rate: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };
type IndexRate  = { ticker: string; name: string; value: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };
type CommodityRate = { name: string; unit: string; value: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };

type MarketData = {
  forex: ForexRate[];
  indices: IndexRate[];
  commodities: CommodityRate[];
  liveAt: number;
  isEstimated: boolean;
};

const MARKET_CACHE_TTL_MS = 60_000;
let marketCache: MarketData | null = null;

// Baseline estimated fallbacks — used both as the initial value and on
// upstream outages. 24h change is null when we genuinely don't know.
const ESTIMATED_INDICES: Omit<IndexRate, "fiatImpact">[] = [
  { ticker: "SPX",  name: "S&P 500",     value: 5_300,  change24h: null, isEstimated: true },
  { ticker: "IXIC", name: "NASDAQ",       value: 16_800, change24h: null, isEstimated: true },
  { ticker: "NKY",  name: "Nikkei 225",  value: 38_500, change24h: null, isEstimated: true },
];
const ESTIMATED_COMMODITIES: Omit<CommodityRate, "fiatImpact">[] = [
  { name: "Gold",      unit: "oz",  value: 2_350, change24h: null, isEstimated: true },
  { name: "Oil (WTI)", unit: "bbl", value: 78,    change24h: null, isEstimated: true },
];

function indexFiatImpact(value: number): string {
  // Each index point maps to $1 USD in the simplified game economy.
  const fiat = Math.round(value * FIAT_PER_USD);
  return `Index value → ƒ${fiat.toLocaleString("en-US")} at current ƒ/USD rate`;
}

function commodityFiatImpact(name: string, usdValue: number): string {
  const fiat = Math.round(usdValue * FIAT_PER_USD);
  if (name.toLowerCase().includes("gold")) {
    return `1 oz Gold at $${usdValue.toLocaleString("en-US")} → ƒ${fiat.toLocaleString("en-US")} in-game`;
  }
  return `1 bbl at $${usdValue.toLocaleString("en-US")} → ƒ${fiat.toLocaleString("en-US")} in-game`;
}

function forexFiatImpact(base: string, rate: number): string {
  // Rate is how many USD per 1 unit of the base currency when base≠USD,
  // or USD per 1 JPY when base=JPY. We display the ƒ cost of 1 base unit.
  const fiat = Math.round(rate * FIAT_PER_USD);
  return `1 ${base} ≈ $${rate.toFixed(4)} → ƒ${fiat.toLocaleString("en-US")}`;
}

async function fetchMarkets(): Promise<MarketData> {
  // ── Forex: live from frankfurter.app ──────────────────────────────────────
  // The API returns USD-denominated rates for each target currency, i.e.
  // how many units of target currency equal 1 USD. We invert to get "USD
  // per 1 unit of target" for the display / ƒ-impact calculation.
  const forexPairs: ForexRate[] = [];
  let forexIsEstimated = true;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5_000);
    const resp = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP",
      { signal: controller.signal },
    );
    clearTimeout(tid);
    if (resp.ok) {
      const data = (await resp.json()) as { rates?: Record<string, number> };
      const rates = data?.rates ?? {};
      for (const [quote, ratePerUsd] of Object.entries(rates)) {
        // ratePerUsd = units of `quote` per $1 USD → invert for "USD per 1 quote"
        const usdPerQuote = ratePerUsd > 0 ? 1 / ratePerUsd : 0;
        forexPairs.push({
          pair: `USD/${quote}`,
          base: quote,
          quote: "USD",
          rate: Number(usdPerQuote.toFixed(6)),
          change24h: null,
          fiatImpact: forexFiatImpact(quote, usdPerQuote),
          isEstimated: false,
        });
      }
      forexIsEstimated = false;
    }
  } catch {
    // Upstream down or timeout — fall through to empty forexPairs; caller
    // will fill in from cache or use estimated fallbacks.
  }

  if (forexPairs.length === 0) {
    forexPairs.push(
      { pair: "USD/EUR", base: "EUR", quote: "USD", rate: 0.9250, change24h: null, fiatImpact: forexFiatImpact("EUR", 1 / 0.9250), isEstimated: true },
      { pair: "USD/JPY", base: "JPY", quote: "USD", rate: 0.0066, change24h: null, fiatImpact: forexFiatImpact("JPY", 0.0066),     isEstimated: true },
      { pair: "USD/GBP", base: "GBP", quote: "USD", rate: 0.7900, change24h: null, fiatImpact: forexFiatImpact("GBP", 1 / 0.7900), isEstimated: true },
    );
    forexIsEstimated = true;
  }

  // ── Indices + Commodities: estimated (no free no-key real-time API) ────────
  const indices: IndexRate[] = ESTIMATED_INDICES.map(i => ({
    ...i,
    fiatImpact: indexFiatImpact(i.value),
  }));
  const commodities: CommodityRate[] = ESTIMATED_COMMODITIES.map(c => ({
    ...c,
    fiatImpact: commodityFiatImpact(c.name, c.value),
  }));

  return {
    forex: forexPairs,
    indices,
    commodities,
    liveAt: Date.now(),
    isEstimated: forexIsEstimated,
  };
}

router.get("/economy/markets", async (_req: Request, res: Response) => {
  try {
    if (marketCache && Date.now() - marketCache.liveAt < MARKET_CACHE_TTL_MS) {
      res.json(marketCache);
      return;
    }
    const fresh = await fetchMarkets();
    marketCache = fresh;
    res.json(fresh);
  } catch (e: any) {
    console.error("[economy/markets]", e);
    // Return last-known cache with isEstimated=true rather than 500-ing.
    if (marketCache) {
      res.json({ ...marketCache, isEstimated: true });
    } else {
      res.status(500).json({ error: e?.message || "markets fetch failed" });
    }
  }
});

export default router;
