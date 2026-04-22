import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, realEstateListingsTable, type RealEstateListing } from "@workspace/db";
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

const VALID_TYPES = new Set(["office", "loft", "tower", "studio", "warehouse", "retail", "kiosk"]);
const VALID_LISTING_TYPES = new Set(["sale", "rent"]);

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

export default router;
