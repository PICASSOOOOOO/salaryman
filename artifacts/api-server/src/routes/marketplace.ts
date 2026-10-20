import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
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
import { creditFiat, spendFiat } from "../lib/fiat-wallet";

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
const ITEM_CAPACITY = 24;

async function restoreEscrowedItem(tx: any, listing: typeof marketplaceItemListingsTable.$inferSelect) {
  await tx.insert(playerInventoryTable).values({
    userId: listing.sellerId,
    slotIndex: listing.sellerSlot,
    itemId: listing.itemId,
    quantity: listing.quantity,
    acquiredVia: "market",
  }).onConflictDoUpdate({
    target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
    set: { quantity: sql`${playerInventoryTable.quantity} + ${listing.quantity}` },
  });
}

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

    const rawCity = String(req.body?.cityId || "minx_prime").trim();
    const cityId = CITY_ALIASES[rawCity]?.find((value) => value.endsWith("_prime")) || (rawCity === "huda" ? "huda_prime" : rawCity === "minx" ? "minx_prime" : rawCity);
    if (!/^[a-z0-9_]{1,32}$/.test(cityId)) { res.status(400).json({ error: "Invalid city" }); return; }
    const user = await db.select({ firstName: usersTable.firstName, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const created = await db.transaction(async (tx) => {
      const [inventory] = await tx.select().from(playerInventoryTable)
        .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slotIndex), eq(playerInventoryTable.itemId, itemId)))
        .for("update").limit(1);
      if (!inventory || inventory.quantity < quantity) throw new Error("ITEM_QUANTITY_UNAVAILABLE");
      const [row] = await tx.update(playerInventoryTable)
        .set({ quantity: sql`${playerInventoryTable.quantity} - ${quantity}` })
        .where(and(eq(playerInventoryTable.id, inventory.id), sql`${playerInventoryTable.quantity} >= ${quantity}`))
        .returning({ quantity: playerInventoryTable.quantity });
      if (!row) throw new Error("ITEM_QUANTITY_UNAVAILABLE");
      if (row.quantity === 0) await tx.delete(playerInventoryTable).where(eq(playerInventoryTable.id, inventory.id));
      const [listing] = await tx.insert(marketplaceItemListingsTable).values({
        sellerId: userId,
        sellerSlot: slotIndex,
        sellerName: userDisplayName(user[0]),
        itemId,
        itemName: item.name,
        quantity,
        priceFiat,
        cityId,
        description: typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 1000) : item.blurb,
        artKey: typeof req.body?.artKey === "string" ? req.body.artKey.trim().slice(0, 256) || null : itemId,
        escrowed: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      return listing;
    });
    res.status(201).json({ listing: created });
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_QUANTITY_UNAVAILABLE") {
      res.status(409).json({ error: "You do not have that quantity available to list." }); return;
    }
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
    const cancelled = await db.transaction(async (tx) => {
      const [listing] = await tx.select().from(marketplaceItemListingsTable)
        .where(and(eq(marketplaceItemListingsTable.id, id), eq(marketplaceItemListingsTable.sellerId, userId), eq(marketplaceItemListingsTable.status, "active")))
        .for("update").limit(1);
      if (!listing) return null;
      const [changed] = await tx.update(marketplaceItemListingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(marketplaceItemListingsTable.id, id), eq(marketplaceItemListingsTable.status, "active")))
        .returning({ id: marketplaceItemListingsTable.id });
      if (!changed) return null;
      if (listing.escrowed) await restoreEscrowedItem(tx, listing);
      return changed;
    });
    if (!cancelled) { res.status(404).json({ error: "Listing not found" }); return; }
    res.json({ ok: true, id: cancelled.id, returned: true });
  } catch (error) {
    console.error("[marketplace] item delete error", error);
    res.status(500).json({ error: "Failed to unlist item" });
  }
});

// POST /marketplace/items/:id/buy — buy the full escrowed player-character listing.
router.post("/marketplace/items/:id/buy", async (req: Request, res: Response) => {
  const buyerId = requireAuth(req, res);
  if (!buyerId) return;
  const id = Number.parseInt(String(req.params.id), 10);
  const buyerSlot = Number.parseInt(String(req.body?.slotIndex ?? "0"), 10);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(buyerSlot) || buyerSlot < 0 || buyerSlot > 64) {
    res.status(400).json({ error: "Invalid listing or save slot" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx.select().from(marketplaceItemListingsTable)
        .where(eq(marketplaceItemListingsTable.id, id)).for("update").limit(1);
      if (!listing || listing.status !== "active" || (listing.expiresAt && listing.expiresAt <= new Date())) {
        return { status: 404 as const, body: { error: "Listing is no longer available." } };
      }
      if (listing.sellerId === buyerId) return { status: 400 as const, body: { error: "You cannot buy your own listing." } };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${buyerId}), ${buyerSlot})`);
      const [buyerItem] = await tx.select({ quantity: playerInventoryTable.quantity })
        .from(playerInventoryTable)
        .where(and(eq(playerInventoryTable.userId, buyerId), eq(playerInventoryTable.slotIndex, buyerSlot), eq(playerInventoryTable.itemId, listing.itemId)))
        .limit(1);
      const buyerRows = await tx.select({ itemId: playerInventoryTable.itemId })
        .from(playerInventoryTable)
        .where(and(eq(playerInventoryTable.userId, buyerId), eq(playerInventoryTable.slotIndex, buyerSlot)));
      if (!buyerItem && buyerRows.length >= ITEM_CAPACITY) {
        return { status: 409 as const, body: { error: "Inventory full. Store an item in your home locker first.", usedSlots: buyerRows.length, capacity: ITEM_CAPACITY } };
      }
      let legacySellerItem: typeof playerInventoryTable.$inferSelect | undefined;
      if (!listing.escrowed) {
        const [sellerItem] = await tx.select().from(playerInventoryTable)
          .where(and(
            eq(playerInventoryTable.userId, listing.sellerId),
            eq(playerInventoryTable.slotIndex, listing.sellerSlot),
            eq(playerInventoryTable.itemId, listing.itemId),
          )).for("update").limit(1);
        if (!sellerItem || sellerItem.quantity < listing.quantity) {
          return { status: 409 as const, body: { error: "Seller no longer has the listed quantity." } };
        }
        legacySellerItem = sellerItem;
      }
      for (const walletId of [buyerId, listing.sellerId].sort()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${walletId}), 41001)`);
      }
      const paid = await spendFiat(tx, {
        userId: buyerId,
        amountFiat: listing.priceFiat,
        description: `Player market: ${listing.quantity} × ${listing.itemName}`,
        kind: "marketplace_item_buy",
      });
      if (!paid.ok) return { status: 402 as const, body: { error: "insufficient_fiat", required: listing.priceFiat, spendable: paid.spendable } };
      if (legacySellerItem) {
        const remaining = legacySellerItem.quantity - listing.quantity;
        if (remaining === 0) await tx.delete(playerInventoryTable).where(eq(playerInventoryTable.id, legacySellerItem.id));
        else await tx.update(playerInventoryTable).set({ quantity: remaining }).where(eq(playerInventoryTable.id, legacySellerItem.id));
      }
      const flipped = await tx.update(marketplaceItemListingsTable)
        .set({ status: "sold", updatedAt: new Date() })
        .where(and(eq(marketplaceItemListingsTable.id, id), eq(marketplaceItemListingsTable.status, "active")))
        .returning({ id: marketplaceItemListingsTable.id });
      if (flipped.length === 0) return { status: 409 as const, body: { error: "Listing was already purchased." } };
      await tx.insert(playerInventoryTable).values({
        userId: buyerId, slotIndex: buyerSlot, itemId: listing.itemId,
        quantity: listing.quantity, acquiredVia: "market",
      }).onConflictDoUpdate({
        target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
        set: { quantity: sql`${playerInventoryTable.quantity} + ${listing.quantity}` },
      });
      await creditFiat(tx, {
        userId: listing.sellerId,
        amountFiat: listing.priceFiat,
        description: `Player market sale: ${listing.quantity} × ${listing.itemName}`,
        kind: "marketplace_item_sale",
      });
      return { status: 200 as const, body: { ok: true, itemId: listing.itemId, quantity: listing.quantity, priceFiat: listing.priceFiat, newBalance: paid.newBalance } };
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error("[marketplace] item buy error", error);
    res.status(500).json({ error: "Failed to settle item listing." });
  }
});

export default router;