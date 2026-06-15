import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, gt, ne, isNotNull } from "drizzle-orm";
import { db, realEstateListingsTable, salarymanSavesTable, type RealEstateListing } from "@workspace/db";
import { createImageTask, getTaskRecord, isNanoBananaConfigured } from "../lib/nano-banana";
import { composeSalarymanPrompt } from "../lib/salaryman-art";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

const VALID_TYPES = new Set(["office", "loft", "tower", "studio", "warehouse", "retail", "kiosk", "penthouse", "hq"]);
const VALID_LISTING_TYPES = new Set(["sale", "rent"]);

// ── Live BTC market index ────────────────────────────────────────────────────
// Real-estate prices follow Bitcoin: when BTC rallies, dwellings get pricier.
// Multiplier is normalized against a $50k baseline and clamped 0.4–4.0 so the
// market never goes wild enough to lock everyone out (or give it away).
const BTC_BASELINE_USD = 50_000;
const MARKET_CACHE_TTL_MS = 60_000;
let marketCache: { btcUsd: number; multiplier: number; asOf: number; source: string } | null = null;

async function fetchBtcUsd(): Promise<{ price: number; source: string }> {
  // CoinGecko free public endpoint — no key required.
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = (await res.json()) as { bitcoin?: { usd?: number } };
  const price = Number(j?.bitcoin?.usd);
  if (!Number.isFinite(price) || price <= 0) throw new Error("coingecko bad payload");
  return { price, source: "coingecko" };
}

async function getMarketIndex(): Promise<{ btcUsd: number; multiplier: number; asOf: number; source: string }> {
  const now = Date.now();
  if (marketCache && now - marketCache.asOf < MARKET_CACHE_TTL_MS) return marketCache;
  try {
    const { price, source } = await fetchBtcUsd();
    const raw = price / BTC_BASELINE_USD;
    const multiplier = Math.max(0.4, Math.min(4.0, raw));
    marketCache = { btcUsd: price, multiplier, asOf: now, source };
    return marketCache;
  } catch (e) {
    // If the upstream fails, serve last known value (or fall back to neutral 1.0).
    if (marketCache) return marketCache;
    marketCache = { btcUsd: BTC_BASELINE_USD, multiplier: 1.0, asOf: now, source: "fallback" };
    return marketCache;
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
// Conversion constants are AUTHORED by the game economy, not market data:
//   $20 USD = 0.1 GOLD (oz, in-game) = ƒ20,000
// → $1 USD = ƒ1000 = 0.005 oz GOLD
//   1 oz GOLD = $200 USD = ƒ200,000
const USD_TO_FIAT = 1000;        // 1 USD => ƒ1000
const USD_TO_GOLD_OZ = 0.005;    // 1 USD => 0.005 oz gold (1 oz = $200)
router.get("/real-estate/market-index", async (_req: Request, res: Response) => {
  try {
    const [idx, fx] = await Promise.all([getMarketIndex(), getFxRates()]);
    res.json({
      ...idx,
      conversion: {
        usdToFiat: USD_TO_FIAT,
        usdToGoldOz: USD_TO_GOLD_OZ,
        // Pre-computed cross rates for convenience (1 BTC in each unit)
        btcToFiat: idx.btcUsd * USD_TO_FIAT,
        btcToGoldOz: idx.btcUsd * USD_TO_GOLD_OZ,
      },
      // Live USD→currency fiat FX rates for the display-currency layer. Consumed
      // by src/lib/currency.ts; falls back to its static table when absent.
      fx: fx.rates,
      fxSource: fx.source,
      fxAsOf: fx.asOf,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "market index failed" });
  }
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
    res.json({ listings: out });
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
    res.json({ listing: refreshed });
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

    const insert = {
      serverId: String(serverId || "minx_prime").slice(0, 32),
      buildingId: buildingId != null ? parseInt(String(buildingId), 10) || null : null,
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

// POST /api/real-estate/listings/:id/buy — execute a sale (auth required)
router.post("/real-estate/listings/:id/buy", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const buyerId = String(u.id);
    const buyerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);

    const [listing] = await db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.id, id));
    if (!listing) { res.status(404).json({ error: "listing not found" }); return; }
    if (listing.status !== "active") { res.status(409).json({ error: `listing is ${listing.status}` }); return; }
    if (listing.sellerId === buyerId) { res.status(400).json({ error: "cannot buy your own listing" }); return; }
    if (listing.listingType !== "sale") { res.status(400).json({ error: "listing is not for sale" }); return; }

    // NOTE: the actual FIAT debit happens client-side via the existing
    // /world/transactions ledger; this route only marks the listing as sold.
    // We do require the client to have already debited; future iteration can
    // tie this together transactionally with the salaryman_saves balance.
    const [updated] = await db.update(realEstateListingsTable)
      .set({
        status: "sold",
        buyerId,
        buyerName,
        soldAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(realEstateListingsTable.id, id), eq(realEstateListingsTable.status, "active")))
      .returning();
    if (!updated) { res.status(409).json({ error: "race: listing already sold" }); return; }
    res.json({ listing: updated });
  } catch (e: any) {
    console.error("[real-estate] buy error", e);
    res.status(500).json({ error: e?.message || "Failed to buy listing" });
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
    const { artKey, tenure, slot } = (req.body || {}) as { artKey?: string; tenure?: string; slot?: number | string };
    const entry = PROPERTY_CATALOG[String(artKey)];
    if (!entry) { res.status(400).json({ error: "unknown property" }); return; }
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

      const balance = Number(save.salary ?? 0);
      if (balance < price) return { status: 402 as const, body: { error: "Insufficient funds", required: price, balance } };

      const newBalance = balance - price;
      const data = (save.data ?? {}) as Record<string, unknown>;
      data.salary = newBalance;
      if (entry.kind === "office") data.office = owned; else data.home = owned;

      await tx.update(salarymanSavesTable)
        .set({ salary: newBalance, data, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)));

      return { status: 200 as const, body: { ok: true, newBalance, price, multiplier: idx.multiplier, owned } };
    });

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
