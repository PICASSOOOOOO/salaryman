import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  businessListingsTable,
  realEstateListingsTable,
  fleetVehiclesTable,
  marketplaceItemListingsTable,
  playerInventoryTable,
  usersTable,
} from "@workspace/db";
import { findCatalogItem } from "../lib/item-catalog";

const router = Router();
const VALID_CATEGORIES = new Set(["all", "businesses", "properties", "vehicles", "items"]);
const CITY_ALIASES: Record<string, string[]> = {
  minx: ["minx", "minx_city", "minx_prime"],
  minx_city: ["minx", "minx_city", "minx_prime"],
  minx_prime: ["minx", "minx_city", "minx_prime"],
  huda: ["huda", "huda_city", "huda_prime"],
  huda_city: ["huda", "huda_city", "huda_prime"],
  huda_prime: ["huda", "huda_city", "huda_prime"],
};

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String((req.user as { id: string }).id);
}

function cityMatches(cityId: string, requested?: string): boolean {
  if (!requested || requested === "all") return true;
  const aliases = CITY_ALIASES[requested.toLowerCase()];
  return aliases ? aliases.includes(cityId) : cityId === requested;
}

function displayCityId(cityId: string): string {
  if (cityId.startsWith("huda")) return "huda_city";
  if (cityId.startsWith("minx")) return "minx_city";
  return cityId;
}

function userDisplayName(user: { firstName?: string | null; email?: string | null } | null | undefined): string {
  return String(user?.firstName || user?.email?.split("@")[0] || "Anonymous").slice(0, 64);
}

function activeListingBase(input: {
  id: string;
  category: "businesses" | "properties" | "vehicles" | "items";
  title: string;
  description?: string | null;
  priceFiat: number;
  cityId: string;
  sellerId: string;
  sellerName: string;
  art?: string | null;
  listingType: string;
  createdAt: Date;
  mine: boolean;
  quantity?: number;
  itemId?: string;
}) {
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    description: input.description || "",
    priceFiat: Math.max(0, Number(input.priceFiat) || 0),
    cityId: displayCityId(input.cityId),
    sourceCityId: input.cityId,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    art: input.art || null,
    listingType: input.listingType,
    createdAt: input.createdAt,
    mine: input.mine,
    ...(input.quantity == null ? {} : { quantity: input.quantity }),
    ...(input.itemId == null ? {} : { itemId: input.itemId }),
  };
}

// GET /marketplace/feed — one normalized, cross-city marketplace feed.
router.get("/marketplace/feed", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rawCategory = String(req.query.category || "all").toLowerCase();
    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : "all";
    const city = String(req.query.city || "all").toLowerCase();
    const mine = String(req.query.mine || "").toLowerCase() === "true" || String(req.query.mine || "") === "1";
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || "40"), 10) || 40));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || "0"), 10) || 0);

    const [allBusinesses, allProperties, allVehicles, allItemRows] = await Promise.all([
      db.select().from(businessListingsTable).where(eq(businessListingsTable.status, "active")).orderBy(desc(businessListingsTable.createdAt)).limit(200),
      db.select().from(realEstateListingsTable).where(eq(realEstateListingsTable.status, "active")).orderBy(desc(realEstateListingsTable.createdAt)).limit(200),
      db.select().from(fleetVehiclesTable).orderBy(desc(fleetVehiclesTable.createdAt)).limit(200),
      db.select().from(marketplaceItemListingsTable).where(eq(marketplaceItemListingsTable.status, "active")).orderBy(desc(marketplaceItemListingsTable.createdAt)).limit(200),
    ]);
    const businesses = category === "all" || category === "businesses" ? allBusinesses : [];
    const properties = category === "all" || category === "properties" ? allProperties : [];
    const vehicles = category === "all" || category === "vehicles" ? allVehicles : [];
    const itemRows = category === "all" || category === "items" ? allItemRows : [];

    const now = new Date();
    const listings = [
      ...businesses.map((row) => activeListingBase({
        id: `business:${row.id}`, category: "businesses", title: row.title, description: row.description,
        priceFiat: row.listingType === "lease" ? row.monthlyLeaseFiat : row.priceFiat,
        cityId: row.serverId, sellerId: row.sellerId, sellerName: row.sellerName, art: row.artUrl,
        listingType: row.listingType, createdAt: row.createdAt, mine: row.sellerId === userId,
      })),
      ...properties.map((row) => activeListingBase({
        id: `property:${row.id}`, category: "properties", title: row.title, description: row.description,
        priceFiat: row.listingType === "rent" ? row.monthlyRentFiat : row.priceFiat,
        cityId: row.serverId, sellerId: row.sellerId, sellerName: row.sellerName, art: row.artUrl,
        listingType: row.listingType, createdAt: row.createdAt, mine: row.sellerId === userId,
      })),
      ...vehicles.filter((row) => !row.currentRenterUserId || !row.rentalEndsAt || row.rentalEndsAt <= now).map((row) => activeListingBase({
        id: `vehicle:${row.id}`, category: "vehicles", title: row.name, description: `${row.vehicleType.replace(/_/g, " ")} rental`,
        priceFiat: row.rateFiatPerHr, cityId: row.cityId, sellerId: `org:${row.orgId}`, sellerName: row.orgName || "Fleet operator",
        listingType: "rent", createdAt: row.createdAt, mine: false,
      })),
      ...itemRows.filter((row) => !row.expiresAt || row.expiresAt > now).map((row) => activeListingBase({
        id: `item:${row.id}`, category: "items", title: row.itemName, description: row.description,
        priceFiat: row.priceFiat, cityId: row.cityId, sellerId: row.sellerId, sellerName: row.sellerName, art: row.artKey,
        listingType: "sale", createdAt: row.createdAt, mine: row.sellerId === userId, quantity: row.quantity, itemId: row.itemId,
      })),
    ].filter((listing) => cityMatches(listing.sourceCityId, city) && (!mine || listing.mine));

    listings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      listings: listings.slice(offset, offset + limit),
      total: listings.length,
      nextOffset: offset + limit < listings.length ? offset + limit : null,
      filters: { category, city: city === "all" ? "all" : displayCityId(city) },
    });
  } catch (error) {
    console.error("[marketplace] feed error", error);
    res.status(500).json({ error: "Failed to load marketplace" });
  }
});

// POST /marketplace/items — list a quantity-backed inventory reference.
router.post("/marketplace/items", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const itemId = String(req.body?.itemId || "").trim();
    const slotIndex = Number.parseInt(String(req.body?.slotIndex ?? "0"), 10);
    const quantity = Number.parseInt(String(req.body?.quantity ?? ""), 10);
    const priceFiat = Number.parseInt(String(req.body?.priceFiat ?? ""), 10);
    const item = findCatalogItem(itemId);
    if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 99) { res.status(400).json({ error: "Invalid save slot" }); return; }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) { res.status(400).json({ error: "Quantity must be positive" }); return; }
    if (!Number.isInteger(priceFiat) || priceFiat <= 0 || priceFiat > 2_000_000_000) { res.status(400).json({ error: "Price must be positive" }); return; }

    const [inventory] = await db.select({ quantity: playerInventoryTable.quantity })
      .from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slotIndex), eq(playerInventoryTable.itemId, itemId)))
      .limit(1);
    if (!inventory || inventory.quantity < quantity) {
      res.status(400).json({ error: "You do not have that quantity in this save slot" }); return;
    }

    const existing = await db.select({ quantity: marketplaceItemListingsTable.quantity })
      .from(marketplaceItemListingsTable)
      .where(and(eq(marketplaceItemListingsTable.sellerId, userId), eq(marketplaceItemListingsTable.itemId, itemId), eq(marketplaceItemListingsTable.status, "active")));
    const alreadyListed = existing.reduce((sum, row) => sum + row.quantity, 0);
    if (alreadyListed + quantity > inventory.quantity) {
      res.status(400).json({ error: "That quantity is already listed" }); return;
    }

    const rawCity = String(req.body?.cityId || "minx_prime").trim();
    const cityId = CITY_ALIASES[rawCity]?.find((value) => value.endsWith("_prime")) || (rawCity === "huda" ? "huda_prime" : rawCity === "minx" ? "minx_prime" : rawCity);
    if (!/^[a-z0-9_]{1,32}$/.test(cityId)) { res.status(400).json({ error: "Invalid city" }); return; }
    const user = await db.select({ firstName: usersTable.firstName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const [created] = await db.insert(marketplaceItemListingsTable).values({
      sellerId: userId,
      sellerName: userDisplayName(user[0]),
      itemId,
      itemName: item.name,
      quantity,
      priceFiat,
      cityId,
      description: typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 1000) : item.blurb,
      artKey: typeof req.body?.artKey === "string" ? req.body.artKey.trim().slice(0, 256) || null : itemId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning();
    res.status(201).json({ listing: created });
  } catch (error) {
    console.error("[marketplace] item create error", error);
    res.status(500).json({ error: "Failed to create item listing" });
  }
});

// DELETE /marketplace/items/:id — only the seller can unlist.
router.delete("/marketplace/items/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid listing id" }); return; }
  try {
    const [deleted] = await db.update(marketplaceItemListingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(marketplaceItemListingsTable.id, id), eq(marketplaceItemListingsTable.sellerId, userId), eq(marketplaceItemListingsTable.status, "active")))
      .returning({ id: marketplaceItemListingsTable.id });
    if (!deleted) { res.status(404).json({ error: "Listing not found" }); return; }
    res.json({ ok: true, id: deleted.id });
  } catch (error) {
    console.error("[marketplace] item delete error", error);
    res.status(500).json({ error: "Failed to unlist item" });
  }
});

export default router;