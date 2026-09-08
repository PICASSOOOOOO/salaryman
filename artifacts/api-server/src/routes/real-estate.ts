import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, gt, ne, isNotNull, or, sql, lte } from "drizzle-orm";
import { db, realEstateListingsTable, cityBuildingsTable, salarymanSavesTable, propertyContractsTable, propertyContractEventsTable, playerLedgerTable, creditScoreHistoryTable, bankTransactionsTable, type RealEstateListing } from "@workspace/db";
import { isPlayablePropertyKey } from "@workspace/api-zod/playable-properties";
import { BROKER_COMMISSION_RATE, PROPERTY_MARKET_UPSELLS, PROPERTY_CONTRACT_CREDIT_HIT_POINTS, PROPERTY_CONTRACT_GRACE_PERIOD_DAYS, PROPERTY_CONTRACT_MAX_CATCH_UP_PERIODS, PROPERTY_CONTRACT_MIN_CREDIT_SCORE, PROPERTY_CONTRACT_SECURITY_DEPOSIT_MONTHS, advancePropertyContractDueDate, propertyContractGraceEndsAt, publicAssetAddress, quotePropertyMarket } from "@workspace/api-zod/property-market";
import { createImageTask, getTaskRecord, isNanoBananaConfigured } from "../lib/nano-banana";
import { composeSalarymanPrompt } from "../lib/salaryman-art";
import { chargePabloTax, PABLO_TAX_MARKUP, FIAT_PER_USD } from "../lib/pablo-tax";
import { creditFiat, spendFiat } from "../lib/fiat-wallet";

// Legacy Pablo Tax is now NARROWED to a one-time transfer tax on large physical
// purchases — buying (not renting) property. AI usage no longer pays Pablo Tax;
// it's metered through the battery system instead.
const PROPERTY_PURCHASE_TAX_RATE = 0.05; // 5% of the purchase price, charged once.

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Calendar-month advance, rather than an imprecise 30-day duration. */
export function addContractMonth(date: Date): Date {
  return advancePropertyContractDueDate(date);
}
export function contractGraceEndsAt(dueAt: Date): Date {
  return propertyContractGraceEndsAt(dueAt);
}

async function contractEvent(tx: any, contractId: number, type: string, amountFiat = 0, metadata: Record<string, unknown> = {}) {
  await tx.insert(propertyContractEventsTable).values({ contractId, type, amountFiat, metadata });
}

/**
 * Assesses one locked agreement. It only records a missed period once because
 * it advances the due cursor in the same transaction that records ledger debt.
 */
export async function assessPropertyContractOverdue(tx: any, contractId: number, now = new Date()) {
  let assessed = 0;
  for (; assessed < PROPERTY_CONTRACT_MAX_CATCH_UP_PERIODS; assessed++) {
    const [contract] = await tx.select().from(propertyContractsTable)
      .where(eq(propertyContractsTable.id, contractId)).for("update").limit(1);
    if (!contract || ["completed", "terminated"].includes(contract.status) || contract.nextDueAt > now) break;
    const graceEnds = contract.graceEndsAt ?? contractGraceEndsAt(contract.nextDueAt);
    if (now < graceEnds) {
      if (contract.status === "active" || !contract.graceEndsAt) {
        await tx.update(propertyContractsTable).set({ status: contract.status === "active" ? "delinquent" : contract.status, graceEndsAt: graceEnds, updatedAt: now }).where(eq(propertyContractsTable.id, contract.id));
        await contractEvent(tx, contract.id, "delinquent", 0, { dueAt: contract.nextDueAt.toISOString(), graceEndsAt: graceEnds.toISOString() });
      }
      break;
    }
    await tx.insert(playerLedgerTable).values({ userId: contract.tenantUserId }).onConflictDoNothing();
    const [ledger] = await tx.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, contract.tenantUserId)).for("update").limit(1);
    const score = Math.max(PROPERTY_CONTRACT_MIN_CREDIT_SCORE, (ledger?.creditScore ?? 680) - PROPERTY_CONTRACT_CREDIT_HIT_POINTS);
    await tx.update(playerLedgerTable).set({
      debt: (ledger?.debt ?? 0) + contract.monthlyRentFiat,
      totalDebtAccrued: (ledger?.totalDebtAccrued ?? 0) + contract.monthlyRentFiat,
      creditScore: score, lastScoreUpdate: now, updatedAt: now,
    }).where(eq(playerLedgerTable.userId, contract.tenantUserId));
    await tx.insert(creditScoreHistoryTable).values({ userId: contract.tenantUserId, score, recordedAt: now });
    await tx.update(propertyContractsTable).set({
      status: "defaulted", outstandingDebtFiat: contract.outstandingDebtFiat + contract.monthlyRentFiat,
      ledgerDebtAppliedFiat: contract.ledgerDebtAppliedFiat + contract.monthlyRentFiat,
      missedPayments: contract.missedPayments + 1, businessCreditPenalty: contract.businessCreditPenalty + PROPERTY_CONTRACT_CREDIT_HIT_POINTS,
      accessRestrictedAt: contract.accessRestrictedAt ?? now, nextDueAt: addContractMonth(contract.nextDueAt), graceEndsAt: null, updatedAt: now,
    }).where(eq(propertyContractsTable.id, contract.id));
    await contractEvent(tx, contract.id, "defaulted", contract.monthlyRentFiat, { dueAt: contract.nextDueAt.toISOString(), creditScore: score });
  }
  return assessed;
}

/** Property-scoped access predicate for future door/access controllers. */
export async function isTenantRestrictedForProperty(tenantUserId: string, canonicalPropertyAddress: string): Promise<boolean> {
  const [row] = await db.select({ id: propertyContractsTable.id }).from(propertyContractsTable).where(and(
    eq(propertyContractsTable.tenantUserId, tenantUserId),
    eq(propertyContractsTable.canonicalPropertyAddress, canonicalPropertyAddress),
    isNotNull(propertyContractsTable.accessRestrictedAt),
    ne(propertyContractsTable.status, "completed"),
    ne(propertyContractsTable.status, "terminated"),
  )).limit(1);
  return !!row;
}

/** Bounded, SKIP LOCKED sweep safe to run on every API instance. */
export async function sweepOverduePropertyContracts(now = new Date()) {
  await db.transaction(async (tx) => {
    const due = await tx.select({ id: propertyContractsTable.id }).from(propertyContractsTable).where(and(
      lte(propertyContractsTable.nextDueAt, now),
      sql`${propertyContractsTable.status} IN ('active', 'delinquent', 'defaulted')`,
    )).orderBy(propertyContractsTable.nextDueAt).limit(50).for("update", { skipLocked: true });
    for (const row of due) await assessPropertyContractOverdue(tx, row.id, now);
  });
}
const overdueSweepTimer = setInterval(() => {
  void sweepOverduePropertyContracts().catch((error) => console.warn("[real-estate] overdue sweep failed", error));
}, 60_000);
overdueSweepTimer.unref();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

const VALID_TYPES = new Set(["office", "loft", "tower", "studio", "warehouse", "retail", "kiosk", "penthouse", "hq"]);
const VALID_LISTING_TYPES = new Set(["sale", "rent"]);

function publicListing(listing: RealEstateListing, economyMultiplier: number) {
  const askingFiat = listing.listingType === "rent" ? listing.monthlyRentFiat : listing.priceFiat;
  const quoted = quotePropertyMarket({ baseFiat: askingFiat, economyMultiplier, selectedUpsellIds: [] });
  if (!quoted.ok) throw new Error("Unable to quote public listing");
  const { sellerId: _sellerId, buyerId: _buyerId, artTaskId: _artTaskId, ...publicFields } = listing;
  const canonicalAddress = publicAssetAddress(listing.buildingId != null
    ? { kind: "property", serverId: listing.serverId, assetKind: "building", assetId: listing.buildingId }
    : { kind: "listing", serverId: listing.serverId, listingId: listing.id });
  return { ...publicFields, canonicalAddress, publicSlug: canonicalAddress, marketQuote: quoted.quote };
}

// ── Live BTC market index ────────────────────────────────────────────────────
// Real-estate prices follow Bitcoin: when BTC rallies, dwellings get pricier.
// Multiplier is normalized against a $50k baseline and clamped 0.4–4.0 so the
// market never goes wild enough to lock everyone out (or give it away).
const BTC_BASELINE_USD = 50_000;
const ETH_BASELINE_USD = 3_000;
const MARKET_CACHE_TTL_MS = 60_000;
const MARKET_MAX_STALE_MS = 15 * 60_000;
export type LiveMarketIndex = {
  btcUsd: number;
  ethUsd: number;
  goldUsd: number | null;
  multiplier: number;
  asOf: number;
  source: string;
  goldSource: string | null;
  goldAsOf: number | null;
  status: "live" | "stale" | "unavailable";
};
let marketCache: LiveMarketIndex | null = null;

// Presentation-only city cost-of-living baselines. Settlement routes continue to
// use the single BTC-scaled FIAT price; these values are returned for client
// readouts and market storytelling.
const CITY_COST_OF_LIVING: Record<string, number> = {
  minx_city: 1.42,
  huda_city: 1.00,
  solaris_drift: 1.16,
  verde_nexus: 1.10,
  obsidian_reach: 0.94,
  cobalt_harbor: 1.28,
  vostok_gate: 1.08,
  crescent_spire: 1.22,
  amber_circuit: 1.04,
  dragon_forge: 1.18,
  coral_vault: 1.24,
};

function getCityMultiplier(cityId: string, btcMultiplier: number): number {
  const baseline = CITY_COST_OF_LIVING[cityId] ?? 1.08;
  const btc = Math.max(0.4, Math.min(4, Number.isFinite(btcMultiplier) && btcMultiplier > 0 ? btcMultiplier : 1));
  return 1 + (baseline - 1) / Math.sqrt(btc);
}

function getCityMultipliers(btcMultiplier: number): Record<string, { labor: number; property: number }> {
  return Object.fromEntries(Object.keys(CITY_COST_OF_LIVING).map((cityId) => {
    const property = getCityMultiplier(cityId, btcMultiplier);
    return [cityId, { property, labor: 1 + (property - 1) * 0.94 }];
  }));
}

async function fetchCryptoUsd(): Promise<{ btcUsd: number; ethUsd: number; source: string }> {
  // CoinGecko free public endpoint — no key required. BTC drives real-estate
  // pricing; ETH is an additional in-game-only market for the exchange counter.
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = (await res.json()) as { bitcoin?: { usd?: number }; ethereum?: { usd?: number } };
  const btcUsd = Number(j?.bitcoin?.usd);
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("coingecko bad payload");
  const ethRaw = Number(j?.ethereum?.usd);
  const ethUsd = Number.isFinite(ethRaw) && ethRaw > 0 ? ethRaw : ETH_BASELINE_USD;
  return { btcUsd, ethUsd, source: "coingecko" };
}

async function fetchGoldUsd(): Promise<{ goldUsd: number; asOf: number; source: string }> {
  const res = await fetch("https://api.gold-api.com/price/XAU", {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`gold-api ${res.status}`);
  const j = (await res.json()) as { price?: unknown; updatedAt?: unknown };
  const goldUsd = Number(j.price);
  if (!Number.isFinite(goldUsd) || goldUsd <= 0) throw new Error("gold-api bad payload");
  const upstreamAt = Date.parse(String(j.updatedAt ?? ""));
  return { goldUsd, asOf: Number.isFinite(upstreamAt) ? upstreamAt : Date.now(), source: "gold-api" };
}

export async function getMarketIndex(): Promise<LiveMarketIndex> {
  const now = Date.now();
  if (marketCache && now - marketCache.asOf < MARKET_CACHE_TTL_MS && marketCache.status === "live") return marketCache;
  try {
    const [{ btcUsd, ethUsd, source }, gold] = await Promise.all([
      fetchCryptoUsd(),
      fetchGoldUsd().catch(() => null),
    ]);
    const raw = btcUsd / BTC_BASELINE_USD;
    const multiplier = Math.max(0.4, Math.min(4.0, raw));
    marketCache = {
      btcUsd,
      ethUsd,
      goldUsd: gold?.goldUsd ?? null,
      multiplier,
      asOf: now,
      source,
      goldSource: gold?.source ?? null,
      goldAsOf: gold?.asOf ?? null,
      status: "live",
    };
    return marketCache;
  } catch {
    if (marketCache && now - marketCache.asOf <= MARKET_MAX_STALE_MS) {
      return { ...marketCache, status: "stale" };
    }
    return {
      btcUsd: 0,
      ethUsd: 0,
      goldUsd: null,
      multiplier: 1,
      asOf: now,
      source: "unavailable",
      goldSource: null,
      goldAsOf: null,
      status: "unavailable",
    };
  }
}

// ── Live fiat FX rates (USD → currency) ──────────────────────────────────────
// The web currency display layer (src/lib/currency.ts) shows USD figures in a
// player-chosen currency. Its static fallback table drifts over time, so we
// fetch live USD→currency rates from a free, keyless source and cache them with
// the same AbortSignal timeout + last-known/static fallback pattern as BTC above.
// Fiat moves slowly relative to BTC, so the TTL is generous.
const FX_CACHE_TTL_MS = 60 * 60_000; // 1 hour
// Coarse fallback rates, mirroring the client's static table. Used only when the
// upstream is unreachable and we have no last-known value cached.
const FX_STATIC: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 157, CNY: 7.2, KRW: 1350, VND: 25000,
  INR: 83, BRL: 5.4, CAD: 1.36, AUD: 1.50, MXN: 18, CHF: 0.89, SGD: 1.35,
};
let fxCache: { rates: Record<string, number>; asOf: number; source: string } | null = null;

async function fetchFxRates(): Promise<{ rates: Record<string, number>; source: string }> {
  // open.er-api.com — free public endpoint, no key required, covers all of our
  // supported currencies. Returns { result, base_code, rates: { EUR: …, … } }.
  const res = await fetch(
    "https://open.er-api.com/v6/latest/USD",
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) throw new Error(`er-api ${res.status}`);
  const j = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (j?.result !== "success" || !j.rates) throw new Error("er-api bad payload");
  const rates: Record<string, number> = {};
  for (const code of Object.keys(FX_STATIC)) {
    const v = Number(j.rates[code]);
    if (Number.isFinite(v) && v > 0) rates[code] = v;
  }
  rates.USD = 1; // anchor — the index is USD-native
  if (Object.keys(rates).length < 2) throw new Error("er-api missing rates");
  return { rates, source: "er-api" };
}

async function getFxRates(): Promise<{ rates: Record<string, number>; asOf: number; source: string }> {
  const now = Date.now();
  if (fxCache && now - fxCache.asOf < FX_CACHE_TTL_MS) return fxCache;
  try {
    const { rates, source } = await fetchFxRates();
    // Backfill any currency the upstream omitted with the static fallback so the
    // table is always complete.
    fxCache = { rates: { ...FX_STATIC, ...rates }, asOf: now, source };
    return fxCache;
  } catch {
    if (fxCache) return fxCache; // serve last known
    fxCache = { rates: { ...FX_STATIC }, asOf: now, source: "fallback" };
    return fxCache;
  }
}

/**
 * True if the caller's claimed ownership (via this `sold` listing row) has
 * been superseded by a later sale of the same physical property.
 *
 * Identity rules:
 *   • If the listing has a `buildingId`, the building is the canonical asset
 *     and any later `sold` row pointing at the same buildingId is the new
 *     truth.
 *   • Otherwise the property is identified by its plot footprint
 *     (server + x/y/w/h). This is best-effort but matches how listings are
 *     created without a backing building row.
 */
async function isStaleOwnership(orig: RealEstateListing): Promise<boolean> {
  if (orig.buildingId != null) {
    const [later] = await db
      .select({ id: realEstateListingsTable.id })
      .from(realEstateListingsTable)
      .where(and(
        eq(realEstateListingsTable.buildingId, orig.buildingId),
        eq(realEstateListingsTable.status, "sold"),
        gt(realEstateListingsTable.soldAt, orig.soldAt ?? new Date(0)),
        ne(realEstateListingsTable.id, orig.id),
        isNotNull(realEstateListingsTable.soldAt),
      ))
      .limit(1);
    return !!later;
  }
  // Fallback: same server + footprint sold more recently.
  const [later] = await db
    .select({ id: realEstateListingsTable.id })
    .from(realEstateListingsTable)
    .where(and(
      eq(realEstateListingsTable.serverId, orig.serverId),
      eq(realEstateListingsTable.x, orig.x),
      eq(realEstateListingsTable.y, orig.y),
      eq(realEstateListingsTable.w, orig.w),
      eq(realEstateListingsTable.h, orig.h),
      eq(realEstateListingsTable.status, "sold"),
      gt(realEstateListingsTable.soldAt, orig.soldAt ?? new Date(0)),
      ne(realEstateListingsTable.id, orig.id),
      isNotNull(realEstateListingsTable.soldAt),
    ))
    .limit(1);
  return !!later;
}

/** True if there's already an active listing covering this same property. */
async function hasActiveListingForProperty(orig: RealEstateListing): Promise<boolean> {
  if (orig.buildingId != null) {
    const [active] = await db
      .select({ id: realEstateListingsTable.id })
      .from(realEstateListingsTable)
      .where(and(
        eq(realEstateListingsTable.buildingId, orig.buildingId),
        eq(realEstateListingsTable.status, "active"),
      ))
      .limit(1);
    return !!active;
  }
  const [active] = await db
    .select({ id: realEstateListingsTable.id })
    .from(realEstateListingsTable)
    .where(and(
      eq(realEstateListingsTable.serverId, orig.serverId),
      eq(realEstateListingsTable.x, orig.x),
      eq(realEstateListingsTable.y, orig.y),
      eq(realEstateListingsTable.w, orig.w),
      eq(realEstateListingsTable.h, orig.h),
      eq(realEstateListingsTable.status, "active"),
    ))
    .limit(1);
  return !!active;
}

/** Build a Nano Banana prompt from a listing using the central Salaryman style. */
function buildArtPrompt(l: { propertyType: string; title: string; description: string; sqft: number }): string {
  const subject = [
    `Isometric exterior of a ${l.propertyType} property called "${l.title}".`,
    `Approximate size: ${l.sqft || "unknown"} sqft.`,
    l.description ? `Notes: ${l.description.slice(0, 200)}` : "",
  ].filter(Boolean).join(" ");
  return composeSalarymanPrompt(subject);
}

/** Fire-and-forget art generation for a freshly-created listing. */
async function kickoffListingArt(listingId: number, listing: { propertyType: string; title: string; description: string; sqft: number }) {
  if (!isNanoBananaConfigured()) return;
  try {
    const taskId = await createImageTask({
      prompt: buildArtPrompt(listing),
      aspectRatio: "4:3",
      resolution: "1K",
      outputFormat: "jpg",
    });
    await db.update(realEstateListingsTable)
      .set({ artTaskId: taskId, artStatus: "pending", updatedAt: new Date() })
      .where(eq(realEstateListingsTable.id, listingId));
  } catch (e: any) {
    console.warn(`[real-estate] art kickoff failed for listing ${listingId}: ${e?.message || e}`);
    await db.update(realEstateListingsTable)
      .set({ artStatus: "failed", updatedAt: new Date() })
      .where(eq(realEstateListingsTable.id, listingId)).catch(() => {});
  }
}

/** Lazily refresh art status for a listing if it has a pending task. */
async function refreshArtIfPending(l: RealEstateListing): Promise<RealEstateListing> {
  if (l.artStatus !== "pending" || !l.artTaskId) return l;
  try {
    const rec = await getTaskRecord(l.artTaskId);
    const data = rec?.data ?? {};
    const state = String(data.state || "").toLowerCase();
    if (state === "success" || state === "completed") {
      let url: string | null = null;
      try {
        const parsed = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
        url = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : null;
      } catch { /* ignore */ }
      if (url) {
        const [updated] = await db.update(realEstateListingsTable)
          .set({ artUrl: url, artStatus: "ready", updatedAt: new Date() })
          .where(eq(realEstateListingsTable.id, l.id))
          .returning();
        return updated || l;
      }
    } else if (state === "fail" || state === "failed") {
      const [updated] = await db.update(realEstateListingsTable)
        .set({ artStatus: "failed", updatedAt: new Date() })
        .where(eq(realEstateListingsTable.id, l.id))
        .returning();
      return updated || l;
    }
  } catch { /* ignore – will retry on next read */ }
  return l;
}

// GET /api/real-estate/market-index — public; live BTC index used for pricing.
// Also returns the in-game currency conversion table so the nav-bar ticker can
// show BTC → USD → ƒ → Gold without round-tripping for each unit.
//
// USD is the fixed reference. BTC is the live multiplier for the in-game rails:
// when BTC rises, FIAT and GOLD are worth more, so fewer units are required for
// $1. Every economy surface reads these same cross-rates.
const USD_TO_FIAT = 100;
const USD_TO_GOLD_OZ = 0.01;
router.get("/real-estate/market-index", async (_req: Request, res: Response) => {
  try {
    const [idx, fx] = await Promise.all([getMarketIndex(), getFxRates()]);
    const btcMultiplier = Number.isFinite(idx.multiplier) && idx.multiplier > 0 ? idx.multiplier : 1;
    const usdToFiat = USD_TO_FIAT / btcMultiplier;
    const usdToGoldOz = USD_TO_GOLD_OZ / btcMultiplier;
    res.json({
      ...idx,
      conversion: {
        usdToFiat,
        usdToGoldOz,
        fiatPerGold: usdToFiat / usdToGoldOz,
        btcPerUsd: idx.btcUsd > 0 ? 1 / idx.btcUsd : null,
        // Pre-computed cross rates for convenience (1 BTC in each unit)
        btcToFiat: idx.btcUsd * usdToFiat,
        btcToGoldOz: idx.btcUsd * usdToGoldOz,
        // 1 ETH in each unit (in-game-only market for the exchange counter).
        ethToFiat: idx.ethUsd * usdToFiat,
        ethToGoldOz: idx.ethUsd * usdToGoldOz,
      },
      // Live USD→currency fiat FX rates for the display-currency layer. Consumed
      // by src/lib/currency.ts; falls back to its static table when absent.
      fx: fx.rates,
      fxSource: fx.source,
      fxAsOf: fx.asOf,
      cityMultipliers: getCityMultipliers(idx.multiplier),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "market index failed" });
  }
});

// Public broker policy and optional paid marketing services. These services are
// deliberately separate from property ownership and require explicit selection.
router.get("/real-estate/broker-config", (_req: Request, res: Response) => {
  res.json({ commissionRate: BROKER_COMMISSION_RATE, upsells: PROPERTY_MARKET_UPSELLS });
});

// GET /api/real-estate/listings — public; lists active listings
router.get("/real-estate/listings", async (req: Request, res: Response) => {
  try {
    const serverId = String(req.query.serverId || "minx_prime");
    const status = String(req.query.status || "active");
    const rows = await db.select().from(realEstateListingsTable)
      .where(and(
        eq(realEstateListingsTable.serverId, serverId),
        eq(realEstateListingsTable.status, status),
      ))
      .orderBy(desc(realEstateListingsTable.featured), desc(realEstateListingsTable.createdAt))
      .limit(100);
    // Opportunistically refresh art for the first ~6 pending rows so listing
    // pages eventually populate without a dedicated worker.
    let refreshed = 0;
    const out: RealEstateListing[] = [];
    for (const r of rows) {
      if (refreshed < 6 && r.artStatus === "pending" && r.artTaskId) {
        out.push(await refreshArtIfPending(r));
        refreshed++;
      } else {
        out.push(r);
      }
    }
    const market = await getMarketIndex();
    res.json({ listings: out.map((listing) => publicListing(listing, market.multiplier)), market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status } });
  } catch (e: any) {
    console.error("[real-estate] list error", e);
    res.status(500).json({ error: e?.message || "Failed to load listings" });
  }
});

// GET /api/real-estate/listings/:id — public single listing
router.get("/real-estate/listings/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const [row] = await db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id));
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    const refreshed = await refreshArtIfPending(row);
    const market = await getMarketIndex();
    res.json({ listing: publicListing(refreshed, market.multiplier), market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status } });
  } catch (e: any) {
    console.error("[real-estate] get error", e);
    res.status(500).json({ error: e?.message || "Failed to load listing" });
  }
});

// POST /api/real-estate/listings — create a listing (auth required)
router.post("/real-estate/listings", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const sellerId = String(u.id);
    const sellerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const {
      title, description, listingType, propertyType, priceFiat, monthlyRentFiat,
      sqft, x, y, w, h, serverId, buildingId,
    } = req.body || {};

    if (typeof title !== "string" || title.trim().length < 2) {
      res.status(400).json({ error: "title required" }); return;
    }
    if (title.length > 120) { res.status(400).json({ error: "title too long" }); return; }
    const lt = String(listingType || "sale");
    if (!VALID_LISTING_TYPES.has(lt)) { res.status(400).json({ error: "invalid listingType" }); return; }
    const pt = String(propertyType || "office");
    if (!VALID_TYPES.has(pt)) { res.status(400).json({ error: "invalid propertyType" }); return; }

    const price = Math.max(0, Math.min(parseInt(String(priceFiat || 0), 10) || 0, 1_000_000_000));
    const rent = Math.max(0, Math.min(parseInt(String(monthlyRentFiat || 0), 10) || 0, 10_000_000));
    if (lt === "sale" && price <= 0) { res.status(400).json({ error: "price required for sale" }); return; }
    if (lt === "rent" && rent <= 0) { res.status(400).json({ error: "monthly rent required for rent listing" }); return; }
    const resolvedBuildingId = buildingId != null ? parseInt(String(buildingId), 10) || null : null;
    if (resolvedBuildingId != null) {
      const [building] = await db.select().from(cityBuildingsTable).where(eq(cityBuildingsTable.id, resolvedBuildingId)).limit(1);
      if (!building || building.ownerId !== sellerId || building.demolished) { res.status(403).json({ error: "building ownership could not be verified" }); return; }
    } else {
      // A plot without a building may only be relisted by its latest recorded buyer.
      const [ownership] = await db.select({ id: realEstateListingsTable.id }).from(realEstateListingsTable).where(and(
        eq(realEstateListingsTable.serverId, String(serverId || "minx_prime").slice(0, 32)),
        eq(realEstateListingsTable.x, parseInt(String(x || 0), 10) || 0), eq(realEstateListingsTable.y, parseInt(String(y || 0), 10) || 0),
        eq(realEstateListingsTable.w, Math.max(20, Math.min(parseInt(String(w || 80), 10) || 80, 800))),
        eq(realEstateListingsTable.h, Math.max(20, Math.min(parseInt(String(h || 60), 10) || 60, 800))),
        eq(realEstateListingsTable.status, "sold"), eq(realEstateListingsTable.buyerId, sellerId),
      )).orderBy(desc(realEstateListingsTable.soldAt)).limit(1);
      if (!ownership) { res.status(403).json({ error: "promised plots require verified current ownership" }); return; }
    }

    const insert = {
      serverId: String(serverId || "minx_prime").slice(0, 32),
       buildingId: resolvedBuildingId,
      sellerId,
      sellerName,
      title: title.trim(),
      description: String(description || "").slice(0, 4000),
      listingType: lt,
      propertyType: pt,
      priceFiat: price,
      monthlyRentFiat: rent,
      x: parseInt(String(x || 0), 10) || 0,
      y: parseInt(String(y || 0), 10) || 0,
      w: Math.max(20, Math.min(parseInt(String(w || 80), 10) || 80, 800)),
      h: Math.max(20, Math.min(parseInt(String(h || 60), 10) || 60, 800)),
      sqft: Math.max(0, Math.min(parseInt(String(sqft || 0), 10) || 0, 1_000_000)),
      status: "active" as const,
      artStatus: "pending" as const,
      featured: false,
    };

    const [created] = await db.insert(realEstateListingsTable).values(insert).returning();

    // Fire-and-forget art generation
    void kickoffListingArt(created.id, {
      propertyType: created.propertyType,
      title: created.title,
      description: created.description,
      sqft: created.sqft,
    });

    res.status(201).json({ listing: created });
  } catch (e: any) {
    console.error("[real-estate] create error", e);
    res.status(500).json({ error: e?.message || "Failed to create listing" });
  }
});

// POST /api/real-estate/listings/:id/buy — execute a sale or sign a rental.
router.post("/real-estate/listings/:id/buy", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const buyerId = String(u.id);
    const buyerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    if (!UUID_RE.test(requestId)) { res.status(400).json({ error: "A valid requestId is required." }); return; }

    const [listing] = await db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id));
    if (!listing) { res.status(404).json({ error: "listing not found" }); return; }
    const market = await getMarketIndex();
    const quoted = quotePropertyMarket({ baseFiat: listing.listingType === "rent" ? listing.monthlyRentFiat : listing.priceFiat, economyMultiplier: market.multiplier, selectedUpsellIds: [] });
    if (!quoted.ok) throw new Error("Unable to quote listing settlement");
    const quote = quoted.quote;
    const result = await db.transaction(async (tx) => {
      // Request IDs are global contract idempotency keys. Check first so a
      // retry remains successful even though the listing is already leased.
      const [priorContract] = await tx.select().from(propertyContractsTable)
        .where(eq(propertyContractsTable.requestId, requestId)).limit(1);
      if (priorContract) return { status: 200 as const, body: { contract: priorContract, marketQuote: quote, duplicate: true } };
      const [locked] = await tx.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id)).for("update").limit(1);
      // A concurrent signer can have created the contract while we waited on
      // the listing lock; re-check the request key before reporting leased.
      const [lockedPriorContract] = await tx.select().from(propertyContractsTable)
        .where(eq(propertyContractsTable.requestId, requestId)).limit(1);
      if (lockedPriorContract) return { status: 200 as const, body: { contract: lockedPriorContract, marketQuote: quote, duplicate: true } };
      if (!locked) return { status: 409 as const, body: { error: "listing is no longer active" } };
      if (locked.status !== "active") {
        // Sales predate a dedicated contract row, so their stable wallet marker
        // is the authoritative idempotency record.
        if (locked.listingType === "sale" && locked.status === "sold" && locked.buyerId === buyerId) {
          const marker = `[request:real-estate-buy:${requestId}]`;
          const [priorSale] = await tx.select({ id: bankTransactionsTable.id }).from(bankTransactionsTable).where(and(
            eq(bankTransactionsTable.userId, buyerId),
            eq(bankTransactionsTable.description, `Broker purchase ${locked.title}`.slice(0, 150) + ` ${marker}`),
          )).limit(1);
          if (priorSale) return { status: 200 as const, body: { listing: locked, marketQuote: quote, market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status }, duplicate: true } };
        }
        return { status: 409 as const, body: { error: "listing is no longer active" } };
      }
      if (locked.sellerId === buyerId) return { status: 400 as const, body: { error: "cannot buy your own listing" } };
      if (locked.listingType === "rent") {
        const now = new Date();
        const canonicalAddress = publicAssetAddress(locked.buildingId != null
          ? { kind: "property", serverId: locked.serverId, assetKind: "building", assetId: locked.buildingId }
          : { kind: "listing", serverId: locked.serverId, listingId: locked.id });
        const deposit = quote.marketFiat * PROPERTY_CONTRACT_SECURITY_DEPOSIT_MONTHS;
        const total = quote.totalFiat + deposit;
        const paid = await spendFiat(tx, { userId: buyerId, amountFiat: total, description: `Rental signing ${locked.title}`, kind: "property_rent", idempotencyKey: `property-contract-sign:${requestId}` });
        if (!paid.ok) return { status: 402 as const, body: { error: "Insufficient funds", required: total, balance: paid.spendable } };
        await creditFiat(tx, { userId: locked.sellerId, amountFiat: quote.marketFiat, description: `First month rent ${locked.title}`, kind: "property_rent", idempotencyKey: `property-contract-landlord:${requestId}` });
        const [contract] = await tx.insert(propertyContractsTable).values({
          listingId: locked.id, canonicalPropertyAddress: canonicalAddress, publicSlug: canonicalAddress,
          landlordUserId: locked.sellerId, tenantUserId: buyerId, status: "active",
          monthlyRentFiat: quote.marketFiat, brokerCommissionFiat: quote.commissionFiat, securityDepositFiat: deposit,
          signedMarketMultiplier: market.multiplier, signedMarketAsOf: new Date(market.asOf),
          nextDueAt: addContractMonth(now), requestId, signedAt: now, updatedAt: now,
        }).returning();
        await contractEvent(tx, contract.id, "signed", 0, { listingId: locked.id, canonicalAddress, marketMultiplier: market.multiplier });
        await contractEvent(tx, contract.id, "first_month_payment", quote.marketFiat, { brokerCommissionFiat: quote.commissionFiat });
        await contractEvent(tx, contract.id, "security_deposit_received", deposit);
        await tx.update(realEstateListingsTable).set({ status: "leased", buyerId, buyerName, soldAt: now, updatedAt: now }).where(eq(realEstateListingsTable.id, locked.id));
        return { status: 201 as const, body: { contract, marketQuote: { ...quote, securityDepositFiat: deposit, totalFiat: total }, market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status }, duplicate: false } };
      }
      if (locked.listingType !== "sale") return { status: 400 as const, body: { error: "listing is not for sale" } };
      const paid = await spendFiat(tx, { userId: buyerId, amountFiat: quote.totalFiat, description: `Broker purchase ${locked.title}`, kind: "property", idempotencyKey: `real-estate-buy:${requestId}` });
      if (!paid.ok) return { status: 402 as const, body: { error: "Insufficient funds", required: quote.totalFiat, balance: paid.spendable } };
      // The seller receives the live asking-price amount; the commission remains
      // with the broker. No unselected marketing service is billed here.
      await creditFiat(tx, { userId: locked.sellerId, amountFiat: quote.marketFiat, description: `Property sale ${locked.title}`, kind: "property_sale", idempotencyKey: `real-estate-sale:${requestId}` });
      const [updated] = await tx.update(realEstateListingsTable).set({ status: "sold", buyerId, buyerName, soldAt: new Date(), updatedAt: new Date() })
        .where(eq(realEstateListingsTable.id, id)).returning();
      return { status: 200 as const, body: { listing: updated, marketQuote: quote, market: { multiplier: market.multiplier, asOf: market.asOf, status: market.status }, duplicate: paid.duplicate === true } };
    });
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[real-estate] buy error", e);
    res.status(500).json({ error: e?.message || "Failed to buy listing" });
  }
});

// GET /api/real-estate/contracts/me — both sides see the same auditable record.
router.get("/real-estate/contracts/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String((req.user as any).id);
    const contracts = await db.transaction(async (tx) => {
      const rows = await tx.select().from(propertyContractsTable).where(or(
        eq(propertyContractsTable.tenantUserId, userId), eq(propertyContractsTable.landlordUserId, userId),
      )).orderBy(desc(propertyContractsTable.updatedAt));
      for (const row of rows) await assessPropertyContractOverdue(tx, row.id);
      return tx.select().from(propertyContractsTable).where(or(
        eq(propertyContractsTable.tenantUserId, userId), eq(propertyContractsTable.landlordUserId, userId),
      )).orderBy(desc(propertyContractsTable.updatedAt));
    });
    res.json({ contracts: contracts.map((contract) => ({ ...contract, accessRestricted: contract.tenantUserId === userId && !!contract.accessRestrictedAt })) });
  } catch (e: any) {
    console.error("[real-estate] contracts error", e);
    res.status(500).json({ error: e?.message || "Failed to load contracts" });
  }
});

router.post("/real-estate/contracts/:id/pay", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userId = String((req.user as any).id);
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    if (!Number.isFinite(id) || !UUID_RE.test(requestId)) { res.status(400).json({ error: "valid contract id and requestId required" }); return; }
    const result = await db.transaction(async (tx) => {
      let [contract] = await tx.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id)).for("update").limit(1);
      if (!contract) return { status: 404 as const, body: { error: "contract not found" } };
      if (contract.tenantUserId !== userId) return { status: 403 as const, body: { error: "tenant only" } };
      await assessPropertyContractOverdue(tx, id);
      [contract] = await tx.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id)).for("update").limit(1);
      if (!contract) return { status: 404 as const, body: { error: "contract not found" } };
      if (["completed", "terminated"].includes(contract.status)) return { status: 409 as const, body: { error: "contract is closed" } };
      const [prior] = await tx.select({ id: propertyContractEventsTable.id }).from(propertyContractEventsTable).where(and(
        eq(propertyContractEventsTable.contractId, id), eq(propertyContractEventsTable.type, "payment"),
        sql`${propertyContractEventsTable.metadata}->>'requestId' = ${requestId}`,
      )).limit(1);
      if (prior) return { status: 200 as const, body: { contract, duplicate: true } };
      const curingDebt = contract.outstandingDebtFiat > 0;
      const due = curingDebt ? contract.outstandingDebtFiat : contract.monthlyRentFiat;
      const landlordRent = curingDebt ? due : contract.monthlyRentFiat;
      const paid = await spendFiat(tx, { userId, amountFiat: due, description: `Contract payment #${id}`, kind: "property_rent", idempotencyKey: `property-contract-payment:${requestId}` });
      if (!paid.ok) return { status: 402 as const, body: { error: "Insufficient funds", required: due, balance: paid.spendable } };
      await creditFiat(tx, { userId: contract.landlordUserId, amountFiat: landlordRent, description: `Contract rent #${id}`, kind: "property_rent", idempotencyKey: `property-contract-landlord-payment:${requestId}` });
      const cured = curingDebt || contract.status === "delinquent";
      // Contract arrears were added to the collection ledger at default. A
      // successful cure must retire that matching collection debt as well.
      if (curingDebt) {
        await tx.insert(playerLedgerTable).values({ userId }).onConflictDoNothing();
        const [ledger] = await tx.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, userId)).for("update").limit(1);
        const ledgerRetired = Math.min(due, contract.ledgerDebtAppliedFiat);
        await tx.update(playerLedgerTable).set({ debt: Math.max(0, (ledger?.debt ?? 0) - ledgerRetired), updatedAt: new Date() }).where(eq(playerLedgerTable.userId, userId));
      }
      const [updated] = await tx.update(propertyContractsTable).set({
        outstandingDebtFiat: cured ? 0 : contract.outstandingDebtFiat,
        ledgerDebtAppliedFiat: curingDebt ? Math.max(0, contract.ledgerDebtAppliedFiat - due) : contract.ledgerDebtAppliedFiat,
        status: cured ? "active" : contract.status, graceEndsAt: cured ? null : contract.graceEndsAt,
        accessRestrictedAt: cured ? null : contract.accessRestrictedAt,
        // Default assessment has already advanced this cursor for arrears.
        nextDueAt: curingDebt ? contract.nextDueAt : addContractMonth(contract.nextDueAt), updatedAt: new Date(),
      }).where(eq(propertyContractsTable.id, id)).returning();
      await contractEvent(tx, id, "payment", due, { requestId, landlordRentFiat: landlordRent, brokerCommissionFiat: curingDebt ? 0 : contract.brokerCommissionFiat, cured });
      return { status: 200 as const, body: { contract: { ...updated, accessRestricted: false }, duplicate: false } };
    });
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[real-estate] contract payment error", e);
    res.status(500).json({ error: e?.message || "Failed to pay contract" });
  }
});

router.post("/real-estate/contracts/:id/terminate", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userId = String((req.user as any).id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "valid contract id required" }); return; }
    const result = await db.transaction(async (tx) => {
      let [contract] = await tx.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id)).for("update").limit(1);
      if (!contract) return { status: 404 as const, body: { error: "contract not found" } };
      if (contract.landlordUserId !== userId && contract.tenantUserId !== userId) return { status: 403 as const, body: { error: "contract party required" } };
      await assessPropertyContractOverdue(tx, id);
      [contract] = await tx.select().from(propertyContractsTable).where(eq(propertyContractsTable.id, id)).for("update").limit(1);
      if (!contract) return { status: 404 as const, body: { error: "contract not found" } };
      if (["completed", "terminated"].includes(contract.status)) return { status: 409 as const, body: { error: "contract is already closed" } };
      const depositApplied = Math.min(contract.securityDepositFiat, contract.outstandingDebtFiat);
      const depositRefund = contract.securityDepositFiat - depositApplied;
      const remainingDebt = contract.outstandingDebtFiat - depositApplied;
      if (depositApplied > 0) {
        await tx.insert(playerLedgerTable).values({ userId: contract.tenantUserId }).onConflictDoNothing();
        const [ledger] = await tx.select().from(playerLedgerTable).where(eq(playerLedgerTable.userId, contract.tenantUserId)).for("update").limit(1);
        await tx.update(playerLedgerTable).set({ debt: Math.max(0, (ledger?.debt ?? 0) - Math.min(depositApplied, contract.ledgerDebtAppliedFiat)), updatedAt: new Date() }).where(eq(playerLedgerTable.userId, contract.tenantUserId));
      }
      if (depositRefund > 0) await creditFiat(tx, { userId: contract.tenantUserId, amountFiat: depositRefund, description: `Deposit refund contract #${id}`, kind: "property_deposit_refund", idempotencyKey: `property-contract-termination:${id}` });
      const [updated] = await tx.update(propertyContractsTable).set({
        status: "terminated", outstandingDebtFiat: remainingDebt, ledgerDebtAppliedFiat: Math.max(0, contract.ledgerDebtAppliedFiat - depositApplied), endedAt: new Date(), updatedAt: new Date(),
      }).where(eq(propertyContractsTable.id, id)).returning();
      await contractEvent(tx, id, "terminated", 0, { terminatedBy: userId, depositAppliedFiat: depositApplied, depositRefundFiat: depositRefund, remainingDebtFiat: remainingDebt });
      return { status: 200 as const, body: { contract: { ...updated, accessRestricted: contract.tenantUserId === userId && !!updated.accessRestrictedAt }, settlement: { depositAppliedFiat: depositApplied, depositRefundFiat: depositRefund, remainingDebtFiat: remainingDebt } } };
    });
    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[real-estate] contract terminate error", e);
    res.status(500).json({ error: e?.message || "Failed to terminate contract" });
  }
});

// ── Showroom catalog (authoritative pricing for /acquire) ────────────────────
// Mirrors the RealtyStore templates by artKey. The SERVER owns the price so a
// tampered client can't buy a tower for ƒ1. monthlyRent is the pre-market base;
// purchase price = rent × 100 × 1.20, both scaled by the live BTC multiplier.
const PURCHASE_MULTIPLE = 100;
const PURCHASE_MARKUP = 1.2;
type OfficeTier = "capsule" | "studio" | "coworking" | "suite";
interface CatalogEntry { kind: "home" | "office"; name: string; tier: OfficeTier; monthlyRent: number; }
const PROPERTY_CATALOG: Record<string, CatalogEntry> = {
  // HOMES
  property_loft:        { kind: "home",   name: "STARTER LOFT",        tier: "capsule",  monthlyRent: 10_000 },
  property_studio:      { kind: "home",   name: "MIDTOWN STUDIO",      tier: "studio",   monthlyRent: 22_000 },
  property_townhouse:   { kind: "home",   name: "FAMILY TOWNHOUSE",    tier: "studio",   monthlyRent: 55_000 },
  property_penthouse:   { kind: "home",   name: "EXECUTIVE PENTHOUSE", tier: "suite",    monthlyRent: 180_000 },
  property_sky_villa:   { kind: "home",   name: "SKY VILLA",           tier: "suite",    monthlyRent: 450_000 },
  // OFFICES
  property_apartment_office: { kind: "office", name: "APARTMENT OFFICE",   tier: "studio",   monthlyRent: 10_000 },
  property_coworking_suite:  { kind: "office", name: "CO-WORKING SUITE",   tier: "coworking", monthlyRent: 28_000 },
  property_corner_office:    { kind: "office", name: "CORNER OFFICE",      tier: "suite",    monthlyRent: 80_000 },
  property_warehouse:        { kind: "office", name: "OPERATIONS WAREHOUSE", tier: "suite",  monthlyRent: 160_000 },
  property_hq_floor:         { kind: "office", name: "HEADQUARTERS FLOOR",  tier: "suite",   monthlyRent: 400_000 },
  property_tower:            { kind: "office", name: "PRIVATE TOWER",       tier: "suite",   monthlyRent: 1_200_000 },
  property_campus:           { kind: "office", name: "CORPORATE CAMPUS",    tier: "suite",   monthlyRent: 4_000_000 },
};

// POST /api/real-estate/acquire — rent or buy a showroom property. Atomically
// debits ƒ from the player's salaryman save and records ownership under
// data.office / data.home. Server-authoritative price (BTC-scaled).
router.post("/real-estate/acquire", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const { artKey, tenure, slot, requestId } = (req.body || {}) as { artKey?: string; tenure?: string; slot?: number | string; requestId?: string };
    if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
      res.status(400).json({ error: "A valid requestId is required." });
      return;
    }
    const entry = PROPERTY_CATALOG[String(artKey)];
    if (!entry) { res.status(400).json({ error: "unknown property" }); return; }
    if (!isPlayablePropertyKey(artKey)) {
      res.status(409).json({ error: "This property is not available until its playable destination is ready." });
      return;
    }
    const ten: "rent" | "own" = tenure === "own" ? "own" : "rent";
    const slotIdx = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);

    const idx = await getMarketIndex();
    const base = entry.monthlyRent * idx.multiplier;
    const price = Math.round(ten === "own" ? base * PURCHASE_MULTIPLE * PURCHASE_MARKUP : base);

    const owned = {
      artKey: String(artKey),
      propertyKey: String(artKey),
      name: entry.name,
      kind: entry.kind,
      tier: entry.tier,
      tenure: ten,
      acquiredAt: new Date().toISOString(),
      price,
      monthly: Math.round(base),
    };

    // Atomic debit + ownership write: lock the save row inside a transaction so
    // two concurrent acquires can't both read the same balance and double-spend.
    const txResult = await db.transaction(async (tx) => {
      const [save] = await tx.select().from(salarymanSavesTable)
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)))
        .limit(1)
        .for("update");
      if (!save) return { status: 404 as const, body: { error: "No save found — play and save first." } };

      const paid = await spendFiat(tx, {
        userId,
        amountFiat: price,
        description: `${ten === "own" ? "Purchase" : "Lease"} ${entry.name}`,
        kind: "property",
        idempotencyKey: `property:${requestId}`,
      });
      if (!paid.ok) return { status: 402 as const, body: { error: "Insufficient funds", required: price, balance: paid.spendable } };
      const newBalance = paid.newBalance;
      const data = (save.data ?? {}) as Record<string, unknown>;
      data.salary = newBalance;
      if (entry.kind === "office") data.office = owned; else data.home = owned;

      await tx.update(salarymanSavesTable)
        .set({ salary: newBalance, data, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)));

      return { status: 200 as const, body: { ok: true, newBalance, price, multiplier: idx.multiplier, owned } };
    });

    // One-time property transfer tax (BUY only) — the narrowed Pablo Tax. Fire-
    // and-forget so it never blocks a purchase the player already paid for; the
    // requestId makes it idempotent against client retries of the same acquire.
    if (txResult.status === 200 && ten === "own") {
      const priceCents = Math.round((price / FIAT_PER_USD) * 100);
      const basis = Math.max(1, Math.round((priceCents * PROPERTY_PURCHASE_TAX_RATE) / PABLO_TAX_MARKUP));
      void chargePabloTax({
        userId,
        kind: "tax",
        label: `property transfer tax: ${entry.name}`.slice(0, 96),
        costBasisCents: basis,
        requestId: `prop-tax:${userId}:${slotIdx}:${artKey}:${owned.acquiredAt}`,
        metadata: { artKey: String(artKey), price, rate: PROPERTY_PURCHASE_TAX_RATE },
      }).catch((e) => console.error("[pablo-tax/property]", e?.message || e));
    }

    res.status(txResult.status).json(txResult.body);
  } catch (e: any) {
    console.error("[real-estate] acquire error", e);
    res.status(500).json({ error: e?.message || "Failed to acquire" });
  }
});

// ── Renovation (cosmetic re-skin of an owned property) ───────────────────────
// An owner can renovate a property they HOLD: a paint/accent swatch, an optional
// signage label, and a lighting mood. None of this changes the tier/footprint —
// it's cosmetic — so it costs a flat ƒ LABOR fee that scales with the interior
// tier (NOT the BTC market; renovation is local labor, so the price is
// deterministic). These constants are mirrored client-side in
// src/lib/property-catalog.ts.
const LABOR_FIAT_PER_CREW_DAY = 2_500;
const TIER_CREW_DAYS: Record<OfficeTier, number> = {
  capsule: 1,
  studio: 2,
  coworking: 4,
  suite: 8,
};
export function renovationCrewDays(tier: OfficeTier): number {
  return TIER_CREW_DAYS[tier] ?? 2;
}
export function renovationLaborCost(tier: OfficeTier): number {
  return renovationCrewDays(tier) * LABOR_FIAT_PER_CREW_DAY;
}

// Curated swatch palette — must match RENOVATION_SWATCHES on the client. The
// server only accepts a theme color from this allow-list so a tampered client
// can't inject arbitrary CSS/markup through the signage/colour fields.
const VALID_SWATCH_HEX = new Set([
  "#38bdf8", "#fbbf24", "#10b981", "#d946ef",
  "#ef4444", "#ffcc00", "#8b5cf6", "#e6e6e6",
]);
const VALID_LIGHTING = new Set(["dim", "normal", "bright"]);
const MAX_SIGNAGE_LEN = 18;

// POST /api/real-estate/renovate — re-skin a property the caller already owns.
// Atomically debits the ƒ LABOR fee from the salaryman save and writes the
// cosmetic customization onto the owned record (data.office / data.home).
router.post("/real-estate/renovate", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const { artKey, slot, themeColor, signage, lighting } = (req.body || {}) as {
      artKey?: string; slot?: number | string;
      themeColor?: string; signage?: string; lighting?: string;
    };

    const entry = PROPERTY_CATALOG[String(artKey)];
    if (!entry) { res.status(400).json({ error: "unknown property" }); return; }
    const slotIdx = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);

    // Validate the cosmetic inputs against the allow-lists. At least one field
    // must be provided — an empty renovation isn't billable.
    const reno: { themeColor?: string; signage?: string; lighting?: "dim" | "normal" | "bright" } = {};
    if (themeColor != null && themeColor !== "") {
      const hex = String(themeColor).toLowerCase();
      if (!VALID_SWATCH_HEX.has(hex)) { res.status(400).json({ error: "invalid swatch" }); return; }
      reno.themeColor = hex;
    }
    if (lighting != null && lighting !== "") {
      if (!VALID_LIGHTING.has(String(lighting))) { res.status(400).json({ error: "invalid lighting" }); return; }
      reno.lighting = String(lighting) as "dim" | "normal" | "bright";
    }
    if (signage != null) {
      const s = String(signage).trim().slice(0, MAX_SIGNAGE_LEN);
      if (s.length > 0) reno.signage = s;
    }
    if (reno.themeColor === undefined && reno.lighting === undefined && reno.signage === undefined) {
      res.status(400).json({ error: "nothing to renovate" }); return;
    }

    const laborCost = renovationLaborCost(entry.tier);
    const crewDays = renovationCrewDays(entry.tier);

    // Atomic ownership-check + debit + customization write. Lock the save row so
    // a concurrent renovate/acquire can't double-charge against a stale balance.
    const txResult = await db.transaction(async (tx) => {
      const [save] = await tx.select().from(salarymanSavesTable)
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)))
        .limit(1)
        .for("update");
      if (!save) return { status: 404 as const, body: { error: "No save found — play and save first." } };

      const data = (save.data ?? {}) as Record<string, unknown>;
      const ownedKey = entry.kind === "office" ? "office" : "home";
      const owned = data[ownedKey] as Record<string, unknown> | undefined;
      // Owners can only renovate a property they actually hold.
      if (!owned || String((owned as { artKey?: string }).artKey) !== String(artKey)) {
        return { status: 403 as const, body: { error: "You don't own this property." } };
      }

      const balance = Number(save.salary ?? 0);
      if (balance < laborCost) {
        return { status: 402 as const, body: { error: "Insufficient funds", required: laborCost, balance } };
      }

      const newBalance = balance - laborCost;
      const prevCustom = (owned.customization && typeof owned.customization === "object"
        ? owned.customization : {}) as Record<string, unknown>;
      const updatedOwned = {
        ...owned,
        customization: { ...prevCustom, ...reno, renovatedAt: new Date().toISOString() },
      };
      data.salary = newBalance;
      data[ownedKey] = updatedOwned;

      await tx.update(salarymanSavesTable)
        .set({ salary: newBalance, data, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)));

      return { status: 200 as const, body: { ok: true, newBalance, laborCost, crewDays, owned: updatedOwned } };
    });

    res.status(txResult.status).json(txResult.body);
  } catch (e: any) {
    console.error("[real-estate] renovate error", e);
    res.status(500).json({ error: e?.message || "Failed to renovate" });
  }
});

// POST /api/real-estate/listings/:id/cancel — seller cancels
router.post("/real-estate/listings/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const sellerId = String(u.id);
    const [updated] = await db.update(realEstateListingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(realEstateListingsTable.id, id),
        eq(realEstateListingsTable.sellerId, sellerId),
        eq(realEstateListingsTable.status, "active"),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "not found or not yours" }); return; }
    res.json({ listing: updated });
  } catch (e: any) {
    console.error("[real-estate] cancel error", e);
    res.status(500).json({ error: e?.message || "Failed to cancel" });
  }
});

// POST /api/real-estate/listings/:id/relist — owner of a sold listing puts
// the property back on the market for resale at a new price.
router.post("/real-estate/listings/:id/relist", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const ownerId = String(u.id);
    const ownerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const { priceFiat, title, description } = (req.body || {}) as {
      priceFiat?: number | string; title?: string; description?: string;
    };
    const price = Math.max(1, Math.min(parseInt(String(priceFiat ?? 0), 10) || 0, 1_000_000_000));
    if (price <= 0) { res.status(400).json({ error: "priceFiat required" }); return; }

    const [orig] = await db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id));
    if (!orig) { res.status(404).json({ error: "listing not found" }); return; }
    if (orig.status !== "sold") { res.status(409).json({ error: `cannot relist ${orig.status} listing` }); return; }
    if (orig.buyerId !== ownerId) { res.status(403).json({ error: "you do not own this property" }); return; }
    // Freshness guard: only the *current* owner can relist. If a newer
    // sold record exists for the same building (or, when buildingId is
    // null, for the same plot footprint), the caller already resold and
    // is no longer the owner — even though their buyerId is still on
    // this historical row. Without this check a stale ex-owner could
    // re-list property they no longer hold.
    const isStale = await isStaleOwnership(orig);
    if (isStale) { res.status(403).json({ error: "you no longer own this property" }); return; }
    // Also prevent a duplicate active listing for the same property.
    if (await hasActiveListingForProperty(orig)) {
      res.status(409).json({ error: "an active listing for this property already exists" }); return;
    }

    const [created] = await db.insert(realEstateListingsTable).values({
      serverId: orig.serverId,
      buildingId: orig.buildingId,
      sellerId: ownerId,
      sellerName: ownerName,
      title: (title?.trim() || `${orig.title} — Resale`).slice(0, 120),
      description: String(description || orig.description || "").slice(0, 4000),
      listingType: "sale",
      propertyType: orig.propertyType,
      priceFiat: price,
      monthlyRentFiat: 0,
      x: orig.x, y: orig.y, w: orig.w, h: orig.h, sqft: orig.sqft,
      status: "active",
      // Inherit existing art (and status) instead of regenerating. If the
      // original never produced art, mark as failed rather than pending so
      // the new listing isn't stuck waiting on a task that will never run.
      artUrl: orig.artUrl,
      artStatus: orig.artUrl ? "ready" : (orig.artStatus === "pending" ? "failed" : (orig.artStatus || "failed")),
      artTaskId: null,
      featured: false,
    }).returning();

    res.status(201).json({ listing: created });
  } catch (e: any) {
    console.error("[real-estate] relist error", e);
    res.status(500).json({ error: e?.message || "Failed to relist" });
  }
});

// POST /api/real-estate/listings/:id/sublet — owner sublets a sold property as
// a rent listing without giving up ownership.
router.post("/real-estate/listings/:id/sublet", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const ownerId = String(u.id);
    const ownerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const { monthlyRentFiat, title, description } = (req.body || {}) as {
      monthlyRentFiat?: number | string; title?: string; description?: string;
    };
    const rent = Math.max(1, Math.min(parseInt(String(monthlyRentFiat ?? 0), 10) || 0, 10_000_000));
    if (rent <= 0) { res.status(400).json({ error: "monthlyRentFiat required" }); return; }

    const [orig] = await db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id));
    if (!orig) { res.status(404).json({ error: "listing not found" }); return; }
    if (orig.status !== "sold") { res.status(409).json({ error: `cannot sublet ${orig.status} listing` }); return; }
    if (orig.buyerId !== ownerId) { res.status(403).json({ error: "you do not own this property" }); return; }
    // Same freshness + duplicate-active guards as relist (see comments above).
    if (await isStaleOwnership(orig)) {
      res.status(403).json({ error: "you no longer own this property" }); return;
    }
    if (await hasActiveListingForProperty(orig)) {
      res.status(409).json({ error: "an active listing for this property already exists" }); return;
    }

    const [created] = await db.insert(realEstateListingsTable).values({
      serverId: orig.serverId,
      buildingId: orig.buildingId,
      sellerId: ownerId,
      sellerName: ownerName,
      title: (title?.trim() || `${orig.title} — Sublet`).slice(0, 120),
      description: String(description || orig.description || "").slice(0, 4000),
      listingType: "rent",
      propertyType: orig.propertyType,
      priceFiat: 0,
      monthlyRentFiat: rent,
      x: orig.x, y: orig.y, w: orig.w, h: orig.h, sqft: orig.sqft,
      status: "active",
      artUrl: orig.artUrl,
      artStatus: orig.artUrl ? "ready" : "pending",
      artTaskId: null,
      featured: false,
    }).returning();

    res.status(201).json({ listing: created });
  } catch (e: any) {
    console.error("[real-estate] sublet error", e);
    res.status(500).json({ error: e?.message || "Failed to sublet" });
  }
});

export default router;
