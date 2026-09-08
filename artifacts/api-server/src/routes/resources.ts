import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, resourceNodesTable, resourceInventoryTable, commodityPricesTable, salarymanSavesTable, resourceListingsTable } from "@workspace/db";
import { RESOURCE_CATALOG, getResourceDef } from "../lib/resource-catalog";
import { RESOURCE_NODE_SEEDS } from "../lib/resource-nodes-seed";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

const RESPAWN_MS = 20 * 60 * 1000; // 20 minutes
const MAX_CONCURRENT_HARVESTERS = 3;
const HARVEST_PROXIMITY = 120; // world units

// ── Seed resource nodes ───────────────────────────────────────────────────
export async function seedResourceNodes(): Promise<void> {
  try {
    const existing = await db.select({ id: resourceNodesTable.id }).from(resourceNodesTable).limit(1);
    if (existing.length > 0) return;
    for (const seed of RESOURCE_NODE_SEEDS) {
      await db.insert(resourceNodesTable).values(seed).onConflictDoNothing();
    }
    console.log(`[resources] Seeded ${RESOURCE_NODE_SEEDS.length} resource nodes`);
  } catch (e: any) {
    console.error("[resources] Seed error:", e?.message);
  }
}

// ── Daily commodity price tick ─────────────────────────────────────────────
export async function tickCommodityPrices(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await db.select({ id: commodityPricesTable.id })
      .from(commodityPricesTable)
      .where(eq(commodityPricesTable.effectiveDate, today))
      .limit(1);
    if (existing.length > 0) return;
    for (const res of RESOURCE_CATALOG) {
      const fluctuation = 1 + (Math.random() * 0.30 - 0.15);
      const price = Math.round(res.basePriceFiat * fluctuation);
      await db.insert(commodityPricesTable).values({
        resourceId: res.id,
        priceFiat: price,
        effectiveDate: today,
      }).onConflictDoNothing();
    }
    console.log(`[resources] Commodity prices set for ${today}`);
  } catch (e: any) {
    console.error("[resources] Price tick error:", e?.message);
  }
}

// GET /api/resources/nodes — all node positions + respawn state
router.get("/resources/nodes", async (req: Request, res: Response) => {
  try {
    const cityId = String(req.query.cityId || "minx_prime");
    const nodes = await db.select().from(resourceNodesTable).where(eq(resourceNodesTable.cityId, cityId));
    const now = Date.now();
    const out = nodes.map(n => ({
      id: n.id,
      resourceId: n.resourceId,
      worldX: n.worldX,
      worldY: n.worldY,
      status: (!n.lastHarvestedAt || now - new Date(n.lastHarvestedAt).getTime() >= RESPAWN_MS) ? 'ready' : 'depleted',
      activeHarvesters: (n.activeHarvesters as string[] || []).length,
    }));
    res.json({ nodes: out });
  } catch (e: any) {
    console.error("[resources] nodes error", e);
    res.status(500).json({ error: "Failed to load nodes" });
  }
});

// GET /api/resources/prices — today's commodity prices at the Assay Office
router.get("/resources/prices", async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db.select().from(commodityPricesTable)
      .where(eq(commodityPricesTable.effectiveDate, today));
    if (rows.length === 0) {
      await tickCommodityPrices();
      const fresh = await db.select().from(commodityPricesTable)
        .where(eq(commodityPricesTable.effectiveDate, today));
      res.json({ prices: fresh, date: today });
    } else {
      res.json({ prices: rows, date: today });
    }
  } catch (e: any) {
    console.error("[resources] prices error", e);
    res.status(500).json({ error: "Failed to load prices" });
  }
});

// GET /api/resources/inventory — authenticated user's resource inventory
router.get("/resources/inventory", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const rows = await db.select().from(resourceInventoryTable)
      .where(eq(resourceInventoryTable.userId, userId));
    res.json({ inventory: rows });
  } catch (e: any) {
    console.error("[resources] inventory error", e);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// POST /api/resources/harvest/:nodeId — claim a harvest from a node
router.post("/resources/harvest/:nodeId", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const nodeId = parseInt(String(req.params.nodeId || ""), 10);
    if (!Number.isFinite(nodeId)) { res.status(400).json({ error: "bad nodeId" }); return; }

    // Validate proximity via player's save (worldX/worldY from save data)
    const slot = Math.max(0, parseInt(String((req.body || {}).slot ?? 0), 10) || 0);
    const { playerX, playerY } = (req.body || {}) as { playerX?: number; playerY?: number };

    const [node] = await db.select().from(resourceNodesTable).where(eq(resourceNodesTable.id, nodeId)).limit(1);
    if (!node) { res.status(404).json({ error: "Node not found" }); return; }

    const now = Date.now();
    const lastHarvestedMs = node.lastHarvestedAt ? new Date(node.lastHarvestedAt).getTime() : 0;
    if (now - lastHarvestedMs < RESPAWN_MS) {
      res.status(409).json({ error: "Node is depleted — respawning soon", respawnMs: RESPAWN_MS - (now - lastHarvestedMs) });
      return;
    }

    const harvesters = (node.activeHarvesters as string[] || []);
    if (!harvesters.includes(userId) && harvesters.length >= MAX_CONCURRENT_HARVESTERS) {
      res.status(409).json({ error: "Node at max capacity — try another" });
      return;
    }

    if (typeof playerX === 'number' && typeof playerY === 'number') {
      const dist = Math.hypot(playerX - node.worldX, playerY - node.worldY);
      if (dist > HARVEST_PROXIMITY) {
        res.status(400).json({ error: "Too far from node" });
        return;
      }
    }

    const resourceDef = getResourceDef(node.resourceId);
    if (!resourceDef) { res.status(500).json({ error: "Unknown resource type" }); return; }

    const qty = 1 + Math.floor(Math.random() * 3); // 1-3 units

    // Award resources and mark node harvested in a transaction
    await db.transaction(async (tx) => {
      await tx.update(resourceNodesTable)
        .set({
          lastHarvestedAt: new Date(),
          activeHarvesters: [],
        })
        .where(eq(resourceNodesTable.id, nodeId));

      const [existing] = await tx.select().from(resourceInventoryTable)
        .where(and(
          eq(resourceInventoryTable.userId, userId),
          eq(resourceInventoryTable.resourceId, node.resourceId),
        ))
        .limit(1);

      if (existing) {
        await tx.update(resourceInventoryTable)
          .set({ quantity: existing.quantity + qty })
          .where(eq(resourceInventoryTable.id, existing.id));
      } else {
        await tx.insert(resourceInventoryTable).values({
          userId,
          resourceId: node.resourceId,
          quantity: qty,
        });
      }
    });

    res.json({ ok: true, resourceId: node.resourceId, name: resourceDef.name, qty, icon: resourceDef.icon });
  } catch (e: any) {
    console.error("[resources] harvest error", e);
    res.status(500).json({ error: e?.message || "Harvest failed" });
  }
});

// POST /api/resources/sell — sell resources at the Assay Office
router.post("/resources/sell", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const { resourceId, quantity, slot } = (req.body || {}) as { resourceId?: string; quantity?: number; slot?: number };
    if (!resourceId || !quantity || quantity < 1) {
      res.status(400).json({ error: "resourceId and quantity required" });
      return;
    }
    const slotIdx = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);

    const today = new Date().toISOString().slice(0, 10);
    const [priceRow] = await db.select().from(commodityPricesTable)
      .where(and(
        eq(commodityPricesTable.resourceId, resourceId),
        eq(commodityPricesTable.effectiveDate, today),
      ))
      .limit(1);

    const resourceDef = getResourceDef(resourceId);
    if (!resourceDef) { res.status(400).json({ error: "Unknown resource" }); return; }
    const pricePerUnit = priceRow?.priceFiat ?? resourceDef.basePriceFiat;
    const totalFiat = pricePerUnit * quantity;

    const result = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(resourceInventoryTable)
        .where(and(
          eq(resourceInventoryTable.userId, userId),
          eq(resourceInventoryTable.resourceId, resourceId),
        ))
        .limit(1)
        .for("update");

      if (!inv || inv.quantity < quantity) {
        return { status: 402 as const, body: { error: "Insufficient resources" } };
      }

      const newQty = inv.quantity - quantity;
      if (newQty === 0) {
        await tx.delete(resourceInventoryTable).where(eq(resourceInventoryTable.id, inv.id));
      } else {
        await tx.update(resourceInventoryTable)
          .set({ quantity: newQty })
          .where(eq(resourceInventoryTable.id, inv.id));
      }

      // Credit player salary
      const [save] = await tx.select().from(salarymanSavesTable)
        .where(and(
          eq(salarymanSavesTable.userId, userId),
          eq(salarymanSavesTable.slotIndex, slotIdx),
        ))
        .limit(1)
        .for("update");

      if (save) {
        const newBalance = Number(save.salary ?? 0) + totalFiat;
        const data = (save.data ?? {}) as Record<string, unknown>;
        data.salary = newBalance;
        await tx.update(salarymanSavesTable)
          .set({ salary: newBalance, data, lastSavedAt: new Date() })
          .where(and(
            eq(salarymanSavesTable.userId, userId),
            eq(salarymanSavesTable.slotIndex, slotIdx),
          ));
      }

      return { status: 200 as const, body: { ok: true, totalFiat, pricePerUnit, quantity, newBalance: Number(save?.salary ?? 0) + totalFiat } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[resources] sell error", e);
    res.status(500).json({ error: e?.message || "Sell failed" });
  }
});

// GET /api/resources/market — raw material player listings
router.get("/resources/market", async (req: Request, res: Response) => {
  try {
    const cityId = String(req.query.cityId || "minx_prime");
    const rows = await db.select().from(resourceListingsTable)
      .where(and(
        eq(resourceListingsTable.cityId, cityId),
        eq(resourceListingsTable.status, "active"),
      ))
      .limit(100);
    res.json({ listings: rows });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load market" });
  }
});

// POST /api/resources/market — list resources for player-to-player sale
router.post("/resources/market", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const userId = String(u.id);
    const sellerName = String(u.firstName || u.email?.split("@")[0] || "Anonymous").slice(0, 64);
    const { resourceId, quantity, pricePerUnit, cityId, slot } = (req.body || {}) as Record<string, any>;

    if (!resourceId || !quantity || quantity < 1 || !pricePerUnit || pricePerUnit < 1) {
      res.status(400).json({ error: "resourceId, quantity, pricePerUnit required" });
      return;
    }
    if (!getResourceDef(resourceId)) { res.status(400).json({ error: "Unknown resource" }); return; }
    const slotIdx = Math.max(0, parseInt(String(slot ?? 0), 10) || 0);

    const result = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(resourceInventoryTable)
        .where(and(
          eq(resourceInventoryTable.userId, userId),
          eq(resourceInventoryTable.resourceId, resourceId),
        ))
        .limit(1)
        .for("update");

      if (!inv || inv.quantity < quantity) {
        return { status: 402 as const, body: { error: "Insufficient resources to list" } };
      }

      const newQty = inv.quantity - quantity;
      if (newQty === 0) {
        await tx.delete(resourceInventoryTable).where(eq(resourceInventoryTable.id, inv.id));
      } else {
        await tx.update(resourceInventoryTable)
          .set({ quantity: newQty })
          .where(eq(resourceInventoryTable.id, inv.id));
      }

      const [listing] = await tx.insert(resourceListingsTable).values({
        sellerId: userId,
        sellerName,
        resourceId,
        quantity: parseInt(String(quantity), 10),
        pricePerUnit: parseInt(String(pricePerUnit), 10),
        cityId: String(cityId || "minx_prime"),
        status: "active",
      }).returning();

      return { status: 201 as const, body: { ok: true, listing } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to list" });
  }
});

// POST /api/resources/market/:id/buy — buy a raw material listing
router.post("/resources/market/:id/buy", requireAuth, async (req: Request, res: Response) => {
  try {
    const u = req.user as any;
    const buyerId = String(u.id);
    const listingId = parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(listingId)) { res.status(400).json({ error: "bad id" }); return; }
    const slotIdx = Math.max(0, parseInt(String((req.body || {}).slot ?? 0), 10) || 0);

    const result = await db.transaction(async (tx) => {
      const [listing] = await tx.select().from(resourceListingsTable)
        .where(eq(resourceListingsTable.id, listingId))
        .limit(1);
      if (!listing) return { status: 404 as const, body: { error: "listing not found" } };
      if (listing.status !== "active") return { status: 409 as const, body: { error: `listing is ${listing.status}` } };
      if (listing.sellerId === buyerId) return { status: 400 as const, body: { error: "cannot buy your own listing" } };

      const totalCost = listing.pricePerUnit * listing.quantity;

      const keys = [
        { role: "buyer", userId: buyerId, slot: slotIdx },
        { role: "seller", userId: listing.sellerId, slot: 0 },
      ].sort((a, b) => a.userId < b.userId ? -1 : 1);

      const saves: Record<string, any> = {};
      for (const k of keys) {
        const [row] = await tx.select().from(salarymanSavesTable)
          .where(and(eq(salarymanSavesTable.userId, k.userId), eq(salarymanSavesTable.slotIndex, k.slot)))
          .limit(1).for("update");
        saves[k.role] = row;
      }
      if (!saves.buyer) return { status: 404 as const, body: { error: "No save found" } };

      const balance = Number(saves.buyer.salary ?? 0);
      if (balance < totalCost) return { status: 402 as const, body: { error: "Insufficient funds", required: totalCost } };

      const [flipped] = await tx.update(resourceListingsTable)
        .set({ status: "sold", buyerId, soldAt: new Date(), updatedAt: new Date() })
        .where(and(eq(resourceListingsTable.id, listingId), eq(resourceListingsTable.status, "active")))
        .returning();
      if (!flipped) return { status: 409 as const, body: { error: "race: listing already taken" } };

      // Debit buyer
      const newBalance = balance - totalCost;
      const bData = (saves.buyer.data ?? {}) as Record<string, unknown>;
      bData.salary = newBalance;
      await tx.update(salarymanSavesTable)
        .set({ salary: newBalance, data: bData, lastSavedAt: new Date() })
        .where(and(eq(salarymanSavesTable.userId, buyerId), eq(salarymanSavesTable.slotIndex, slotIdx)));

      // Credit seller
      if (saves.seller) {
        const sBal = Number(saves.seller.salary ?? 0) + totalCost;
        const sData = (saves.seller.data ?? {}) as Record<string, unknown>;
        sData.salary = sBal;
        await tx.update(salarymanSavesTable)
          .set({ salary: sBal, data: sData, lastSavedAt: new Date() })
          .where(and(eq(salarymanSavesTable.userId, listing.sellerId), eq(salarymanSavesTable.slotIndex, 0)));
      }

      // Award resources to buyer
      const [existingInv] = await tx.select().from(resourceInventoryTable)
        .where(and(
          eq(resourceInventoryTable.userId, buyerId),
          eq(resourceInventoryTable.resourceId, listing.resourceId),
        )).limit(1);
      if (existingInv) {
        await tx.update(resourceInventoryTable)
          .set({ quantity: existingInv.quantity + listing.quantity })
          .where(eq(resourceInventoryTable.id, existingInv.id));
      } else {
        await tx.insert(resourceInventoryTable).values({
          userId: buyerId,
          resourceId: listing.resourceId,
          quantity: listing.quantity,
        });
      }

      return { status: 200 as const, body: { ok: true, newBalance, totalCost, listing: flipped } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Buy failed" });
  }
});

export default router;
