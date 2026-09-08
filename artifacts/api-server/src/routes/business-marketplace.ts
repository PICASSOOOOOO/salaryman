import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, businessListingsTable, salarymanSavesTable, type BusinessListing } from "@workspace/db";
import { createImageTask, getTaskRecord, isNanoBananaConfigured } from "../lib/nano-banana";
import { composeSalarymanPrompt } from "../lib/salaryman-art";
import { creditOrgAccount } from "./org-accounts";
import { resolveCurrentOrgId } from "../lib/org-permissions";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

const VALID_LISTING_TYPES = new Set(["sale", "lease"]);
const VALID_CATEGORIES = new Set([
  "saas", "ecommerce", "content", "agency", "marketplace", "retail", "fintech", "media", "service", "raw_materials",
]);

// ── Valuation model ──────────────────────────────────────────────────────────
// A digital business is valued off the monthly income it throws off, the same
// way digital property is valued off its rent. Sale = a multiple of annualized
// income; lease = a slice of monthly income for operating rights.
//   • SALE price   = monthlyIncome × SALE_MULTIPLE   (≈ 2 years of income)
//   • LEASE / mo   = monthlyIncome × LEASE_RATE      (operator keeps the rest)
const SALE_MULTIPLE = 24;
const LEASE_RATE = 0.45;

function salePrice(monthlyIncome: number): number {
  return Math.round(Math.max(0, monthlyIncome) * SALE_MULTIPLE);
}
function leasePrice(monthlyIncome: number): number {
  return Math.round(Math.max(0, monthlyIncome) * LEASE_RATE);
}

// ── Showroom catalog (authoritative pricing for /acquire) ────────────────────
// NPC-stocked digital businesses always available to buy or lease. The SERVER
// owns monthlyIncome so a tampered client can't buy a unicorn for ƒ1.
interface CatalogEntry {
  key: string;
  name: string;
  kana: string;
  category: string;
  blurb: string;
  monthlyIncome: number; // ƒ / month of net income the business generates
  badge: string;
}
const BUSINESS_CATALOG: CatalogEntry[] = [
  { key: "biz_newsletter",   name: "MICRO NEWSLETTER",    kana: "ニュースレター", category: "content",     blurb: "A 4k-subscriber inbox cult. One send a week, sponsors line up.",            monthlyIncome: 8_000,    badge: "STARTER" },
  { key: "biz_dropship",     name: "DROPSHIP STOREFRONT",  kana: "ドロップシップ", category: "ecommerce",   blurb: "Gadget storefront, supplier does the boxes. You own the funnel.",            monthlyIncome: 18_000,   badge: "STARTER" },
  { key: "biz_micro_saas",   name: "MICRO-SAAS TOOL",      kana: "マイクロSAAS",   category: "saas",        blurb: "One ugly tool, 300 paying nerds, ƒ churn so low it's basically rent.",       monthlyIncome: 42_000,   badge: "STEADY" },
  { key: "biz_agency",       name: "BOUTIQUE AGENCY",      kana: "エージェンシー", category: "agency",      blurb: "Five retainers, two contractors, a Slack that never sleeps.",                monthlyIncome: 75_000,   badge: "STEADY" },
  { key: "biz_app_studio",   name: "MOBILE APP STUDIO",    kana: "アプリ・スタジオ", category: "media",       blurb: "Portfolio of fart-button apps + one sleeper hit pulling real ad money.",     monthlyIncome: 140_000,  badge: "GROWTH" },
  { key: "biz_marketplace",  name: "NICHE MARKETPLACE",    kana: "マーケット",     category: "marketplace", blurb: "Two-sided market for vintage synths. You clip every transaction.",           monthlyIncome: 260_000,  badge: "GROWTH" },
  { key: "biz_fintech",      name: "FINTECH WRAPPER",      kana: "フィンテック",   category: "fintech",     blurb: "A thin app over someone else's rails. Regulators haven't noticed yet.",      monthlyIncome: 520_000,  badge: "SCALE" },
  { key: "biz_platform",     name: "VERTICAL PLATFORM",    kana: "プラットフォーム", category: "saas",        blurb: "The system of record for an entire boring industry. Sticky as tar.",         monthlyIncome: 1_200_000, badge: "EMPIRE" },
];

function catalogEntry(key: string): CatalogEntry | undefined {
  return BUSINESS_CATALOG.find((c) => c.key === key);
}

function catalogView(c: CatalogEntry) {
  return {
    ...c,
    salePrice: salePrice(c.monthlyIncome),
    leasePrice: leasePrice(c.monthlyIncome),
    saleMultiple: SALE_MULTIPLE,
    leaseRate: LEASE_RATE,
  };
}

// ── Art generation (fire-and-forget, mirrors real-estate) ────────────────────
function buildArtPrompt(l: { category: string; title: string; description: string }): string {
  const subject = [
    `Isometric storefront / office of a "${l.category}" digital business called "${l.title}".`,
    l.description ? `Notes: ${l.description.slice(0, 200)}` : "",
  ].filter(Boolean).join(" ");
  return composeSalarymanPrompt(subject);
}

async function kickoffListingArt(listingId: number, listing: { category: string; title: string; description: string }) {
  if (!isNanoBananaConfigured()) return;
  try {
    const taskId = await createImageTask({
      prompt: buildArtPrompt(listing),
      aspectRatio: "4:3",
      resolution: "1K",
      outputFormat: "jpg",
    });
    await db.update(businessListingsTable)
      .set({ artTaskId: taskId, artStatus: "pending", updatedAt: new Date() })
      .where(eq(businessListingsTable.id, listingId));
  } catch (e: any) {
    console.warn(`[business-market] art kickoff failed for listing ${listingId}: ${e?.message || e}`);
    await db.update(businessListingsTable)
      .set({ artStatus: "failed", updatedAt: new Date() })
      .where(eq(businessListingsTable.id, listingId)).catch(() => {});
  }
}

async function refreshArtIfPending(l: BusinessListing): Promise<BusinessListing> {
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
        const [updated] = await db.update(businessListingsTable)
          .set({ artUrl: url, artStatus: "ready", updatedAt: new Date() })
          .where(eq(businessListingsTable.id, l.id))
          .returning();
        return updated || l;
      }
    } else if (state === "fail" || state === "failed") {
      const [updated] = await db.update(businessListingsTable)
        .set({ artStatus: "failed", updatedAt: new Date() })
        .where(eq(businessListingsTable.id, l.id))
        .returning();
      return updated || l;
    }
  } catch { /* ignore – retry next read */ }
  return l;
}

// Owned-business record stored under salaryman save data.businesses[].
interface OwnedBusiness {
  id: string;
  key: string;
  name: string;
  category: string;
  tenure: "own" | "lease";
  monthly: number;      // monthly income the business generates
  price: number;        // what was paid (sale price, or first month lease)
  source: "catalog" | "market";
  acquiredAt: string;
}

function readBusinesses(data: Record<string, unknown>): OwnedBusiness[] {
  const arr = data.businesses;
  return Array.isArray(arr) ? (arr as OwnedBusiness[]) : [];
}

// GET /api/business-market/catalog — public; NPC showroom inventory
router.get("/business-market/catalog", (_req: Request, res: Response) => {
  res.json({
    catalog: BUSINESS_CATALOG.map(catalogView),
    saleMultiple: SALE_MULTIPLE,
    leaseRate: LEASE_RATE,
  });
});

// GET /api/business-market/listings — public; active player listings
router.get("/business-market/listings", async (req: Request, res: Response) => {
  try {
    const serverId = String(req.query.serverId || "minx_prime");
    const status = String(req.query.status || "active");
    const rows = await db.select().from(businessListingsTable)
      .where(and(
        eq(businessListingsTable.serverId, serverId),
        eq(businessListingsTable.status, status),
      ))
      .orderBy(desc(businessListingsTable.featured), desc(businessListingsTable.createdAt))
      .limit(100);
    let refreshed = 0;
    const out: BusinessListing[] = [];
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
    console.error("[business-market] list error", e);
    res.status(500).json({ error: e?.message || "Failed to load listings" });
  }
});

// GET /api/business-market/listings/:id — public single listing
router.get("/business-market/listings/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const [row] = await db.select().from(businessListingsTable).where(eq(businessListingsTable.id, id));
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    const refreshed = await refreshArtIfPending(row);
    res.json({ listing: refreshed });
  } catch (e: any) {
    console.error("[business-market] get error", e);
    res.status(500).json({ error: e?.message || "Failed to load listing" });
  }
});

// GET /api/business-market/mine — auth; owned businesses + my active listings
router.get("/business-market/mine", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const slot = Math.max(0, parseInt(String(req.query.slot ?? 0), 10) || 0);
    const [save] = await db.select().from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const data = (save?.data ?? {}) as Record<string, unknown>;
    const owned = readBusinesses(data);
    const listings = await db.select().from(businessListingsTable)
      .where(and(eq(businessListingsTable.sellerId, userId), eq(businessListingsTable.status, "active")))
      .orderBy(desc(businessListingsTable.createdAt))
      .limit(100);
    res.json({ owned, listings });
  } catch (e: any) {
    console.error("[business-market] mine error", e);
    res.status(500).json({ error: e?.message || "Failed to load holdings" });
  }
});

// POST /api/business-market/acquire — buy or lease a CATALOG business.
// Atomically debits ƒ from the player's salaryman save and records ownership
// under data.businesses[]. Server-authoritative price.
router.post("/business-market/acquire", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const { key, tenure, slot } = (req.body || {}) as { key?: string; tenure?: string; slot?: number | string };
    const entry = catalogEntry(String(key));
    if (!entry) { res.status(400).json({ error: "unknown business" }); return; }
    const ten: "own" | "lease" = tenure === "lease" ? "lease" : "own";
    const slotIdx = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);
    const price = ten === "own" ? salePrice(entry.monthlyIncome) : leasePrice(entry.monthlyIncome);

    const owned: OwnedBusiness = {
      id: `${entry.key}_${Date.now().toString(36)}`,
      key: entry.key,
      name: entry.name,
      category: entry.category,
      tenure: ten,
      monthly: entry.monthlyIncome,
      price,
      source: "catalog",
      acquiredAt: new Date().toISOString(),
    };

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
      const list = readBusinesses(data);
      list.push(owned);
      data.salary = newBalance;
      data.businesses = list;

      await tx.update(salarymanSavesTable)
        .set({ salary: newBalance, data, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIdx)));

      return { status: 200 as const, body: { ok: true, newBalance, price, owned } };
    });

    res.status(txResult.status).json(txResult.body);
  } catch (e: any) {
    console.error("[business-market] acquire error", e);
    res.status(500).json({ error: e?.message || "Failed to acquire" });
  }
});

// POST /api/business-market/listings — list a business for sale or lease.
// Mirrors real-estate listing creation: seller-authored fields, server clamps.
router.post("/business-market/listings", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const sellerId = String(u.id);
    const sellerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const {
      title, description, listingType, category, priceFiat, monthlyLeaseFiat,
      monthlyIncomeFiat, serverId, slot,
    } = req.body || {};

    if (typeof title !== "string" || title.trim().length < 2) {
      res.status(400).json({ error: "title required" }); return;
    }
    if (title.length > 120) { res.status(400).json({ error: "title too long" }); return; }
    const lt = String(listingType || "sale");
    if (!VALID_LISTING_TYPES.has(lt)) { res.status(400).json({ error: "invalid listingType" }); return; }
    const cat = String(category || "saas");
    if (!VALID_CATEGORIES.has(cat)) { res.status(400).json({ error: "invalid category" }); return; }

    const price = Math.max(0, Math.min(parseInt(String(priceFiat || 0), 10) || 0, 1_000_000_000));
    const lease = Math.max(0, Math.min(parseInt(String(monthlyLeaseFiat || 0), 10) || 0, 10_000_000));
    const income = Math.max(0, Math.min(parseInt(String(monthlyIncomeFiat || 0), 10) || 0, 10_000_000));
    if (lt === "sale" && price <= 0) { res.status(400).json({ error: "price required for sale" }); return; }
    if (lt === "lease" && lease <= 0) { res.status(400).json({ error: "monthly lease required for lease listing" }); return; }

    const sellerSlot = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);
    // The seller must have a save at this slot so sale/lease proceeds have a
    // place to land — otherwise a buyer could be charged with no payee.
    const [sellerSave] = await db.select({ id: salarymanSavesTable.id }).from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, sellerId), eq(salarymanSavesTable.slotIndex, sellerSlot)))
      .limit(1);
    if (!sellerSave) { res.status(404).json({ error: "No save found — enter the world and save once before listing." }); return; }

    const insert = {
      serverId: String(serverId || "minx_prime").slice(0, 32),
      sellerId,
      sellerName,
      sellerSlot,
      title: title.trim(),
      description: String(description || "").slice(0, 4000),
      listingType: lt,
      category: cat,
      priceFiat: price,
      monthlyLeaseFiat: lease,
      monthlyIncomeFiat: income,
      status: "active" as const,
      artStatus: "pending" as const,
      featured: false,
    };

    const [created] = await db.insert(businessListingsTable).values(insert).returning();

    void kickoffListingArt(created.id, {
      category: created.category,
      title: created.title,
      description: created.description,
    });

    res.status(201).json({ listing: created });
  } catch (e: any) {
    console.error("[business-market] create error", e);
    res.status(500).json({ error: e?.message || "Failed to create listing" });
  }
});

type TxResult =
  | { status: 200; body: { ok: true; newBalance: number; price: number; owned: OwnedBusiness; listing: BusinessListing } }
  | { status: 400 | 402 | 404 | 409; body: Record<string, unknown> };

/**
 * Atomically settle a player-to-player listing transfer (sale or lease).
 *
 * Everything happens inside ONE transaction so the buyer debit, the seller
 * credit, the listing state flip, and the buyer's ownership write either all
 * land or none do — there is no window where the buyer is charged but the
 * seller is unpaid. Both save rows are locked FOR UPDATE in a deterministic
 * (userId, slot) order to avoid deadlocks between concurrent transfers.
 */
async function settleListingTransfer(
  listingId: number,
  buyerId: string,
  buyerName: string,
  buyerSlot: number,
  mode: "sale" | "lease",
): Promise<TxResult> {
  return db.transaction(async (tx): Promise<TxResult> => {
    const [listing] = await tx.select().from(businessListingsTable)
      .where(eq(businessListingsTable.id, listingId)).limit(1);
    if (!listing) return { status: 404, body: { error: "listing not found" } };
    if (listing.status !== "active") return { status: 409, body: { error: `listing is ${listing.status}` } };
    if (listing.sellerId === buyerId) return { status: 400, body: { error: "cannot transact your own listing" } };
    if (mode === "sale" && listing.listingType !== "sale") return { status: 400, body: { error: "listing is not for sale" } };
    if (mode === "lease" && listing.listingType !== "lease") return { status: 400, body: { error: "listing is not for lease" } };

    const price = mode === "sale" ? listing.priceFiat : listing.monthlyLeaseFiat;

    // Lock both parties' save rows in a stable order (seller != buyer is
    // guaranteed above, so these are two distinct rows).
    const keys: Array<{ role: "buyer" | "seller"; userId: string; slot: number }> = [
      { role: "buyer" as const, userId: buyerId, slot: buyerSlot },
      { role: "seller" as const, userId: listing.sellerId, slot: listing.sellerSlot },
    ].sort((a, b) => (a.userId === b.userId ? a.slot - b.slot : a.userId < b.userId ? -1 : 1));
    const locked: Record<string, typeof salarymanSavesTable.$inferSelect | undefined> = {};
    for (const k of keys) {
      const [row] = await tx.select().from(salarymanSavesTable)
        .where(and(eq(salarymanSavesTable.userId, k.userId), eq(salarymanSavesTable.slotIndex, k.slot)))
        .limit(1)
        .for("update");
      locked[k.role] = row;
    }
    const buyerSave = locked.buyer;
    const sellerSave = locked.seller;
    if (!buyerSave) return { status: 404, body: { error: "No save found — play and save first." } };
    // Abort rather than skip the credit: charging the buyer with no payee would
    // destroy funds. The seller's save is validated at listing time, so this is
    // only reachable if the seller's save was deleted after listing.
    if (!sellerSave) return { status: 409, body: { error: "Seller is no longer available — this listing can't be settled." } };

    const balance = Number(buyerSave.salary ?? 0);
    if (balance < price) return { status: 402, body: { error: "Insufficient funds", required: price, balance } };

    // Flip listing state, guarded on still-active so concurrent buyers lose safely.
    const newStatus = mode === "sale" ? "sold" : "leased";
    const [flipped] = await tx.update(businessListingsTable)
      .set({ status: newStatus, buyerId, buyerName, soldAt: new Date(), updatedAt: new Date() })
      .where(and(eq(businessListingsTable.id, listingId), eq(businessListingsTable.status, "active")))
      .returning();
    if (!flipped) return { status: 409, body: { error: "race: listing already taken" } };

    const owned: OwnedBusiness = {
      id: `mkt_${listing.id}_${Date.now().toString(36)}`,
      key: `listing_${listing.id}`,
      name: listing.title,
      category: listing.category,
      tenure: mode === "sale" ? "own" : "lease",
      monthly: listing.monthlyIncomeFiat,
      price,
      source: "market",
      acquiredAt: new Date().toISOString(),
    };

    // Debit buyer + record ownership.
    const newBalance = balance - price;
    const bData = (buyerSave.data ?? {}) as Record<string, unknown>;
    const list = readBusinesses(bData);
    list.push(owned);
    bData.salary = newBalance;
    bData.businesses = list;
    await tx.update(salarymanSavesTable)
      .set({ salary: newBalance, data: bData, lastSavedAt: new Date() })
      .where(and(eq(salarymanSavesTable.userId, buyerId), eq(salarymanSavesTable.slotIndex, buyerSlot)));

    // Credit seller in the SAME transaction (skip only if they have no save).
    if (sellerSave) {
      const sData = (sellerSave.data ?? {}) as Record<string, unknown>;
      const sBal = Number(sellerSave.salary ?? 0) + price;
      sData.salary = sBal;
      await tx.update(salarymanSavesTable)
        .set({ salary: sBal, data: sData, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, listing.sellerId), eq(salarymanSavesTable.slotIndex, listing.sellerSlot)));
    }

    return { status: 200, body: { ok: true, newBalance, price, owned, listing: flipped } };
  });
}

// POST /api/business-market/listings/:id/buy — purchase a player SALE listing.
router.post("/business-market/listings/:id/buy", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const buyerId = String(u.id);
    const buyerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const slotIdx = Math.max(0, parseInt(String((req.body || {}).slot ?? 0), 10) || 0);
    const out = await settleListingTransfer(id, buyerId, buyerName, slotIdx, "sale");
    if (out.status === 200) {
      const { listing, price } = out.body as { listing: { sellerId: string; title: string }; price: number };
      resolveCurrentOrgId(listing.sellerId).then((orgId) => {
        if (!orgId) return;
        return creditOrgAccount(orgId, "checking", price,
          `MARKETPLACE SALE: ${listing.title}`, "marketplace", listing.sellerId);
      }).catch((err) => console.error("[OrgAccounts] Marketplace shadow credit failed:", err));
    }
    res.status(out.status).json(out.body);
  } catch (e: any) {
    console.error("[business-market] buy error", e);
    res.status(500).json({ error: e?.message || "Failed to buy listing" });
  }
});

// POST /api/business-market/listings/:id/lease — lease a player LEASE listing.
// Charges the first month's lease to the seller and grants operating rights.
router.post("/business-market/listings/:id/lease", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const buyerId = String(u.id);
    const buyerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const slotIdx = Math.max(0, parseInt(String((req.body || {}).slot ?? 0), 10) || 0);
    const out = await settleListingTransfer(id, buyerId, buyerName, slotIdx, "lease");
    if (out.status === 200) {
      const { listing, price } = out.body as { listing: { sellerId: string; title: string }; price: number };
      resolveCurrentOrgId(listing.sellerId).then((orgId) => {
        if (!orgId) return;
        return creditOrgAccount(orgId, "checking", price,
          `MARKETPLACE LEASE: ${listing.title}`, "marketplace", listing.sellerId);
      }).catch((err) => console.error("[OrgAccounts] Marketplace lease shadow credit failed:", err));
    }
    res.status(out.status).json(out.body);
  } catch (e: any) {
    console.error("[business-market] lease error", e);
    res.status(500).json({ error: e?.message || "Failed to lease listing" });
  }
});

// POST /api/business-market/listings/:id/cancel — seller cancels
router.post("/business-market/listings/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const u = req.user as any;
    const sellerId = String(u.id);
    const [updated] = await db.update(businessListingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(businessListingsTable.id, id),
        eq(businessListingsTable.sellerId, sellerId),
        eq(businessListingsTable.status, "active"),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "not found or not yours" }); return; }
    res.json({ listing: updated });
  } catch (e: any) {
    console.error("[business-market] cancel error", e);
    res.status(500).json({ error: e?.message || "Failed to cancel" });
  }
});

export default router;
