import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import {
  db,
  playerInventoryTable,
  playerLoadoutTable,
  playerStorageTable,
  publicLockerStorageTable,
  playerInstalledItemsTable,
  resourceInventoryTable,
  bankAccountsTable,
  salarymanSavesTable,
  botsTable,
  usersTable,
  desktopOfficePresenceTable,
  desktopBasementPresenceTable,
  towerShopInventoryTable,
  towerShopShipmentsTable,
  towerShopAccountsTable,
  shadowTowerOfficeUnitsTable,
  INSTALL_TARGET_TYPES,
  INSTALL_CAPACITY,
  type InstallTargetType,
} from "@workspace/db";
import { eq, and, desc, sql, or } from "drizzle-orm";
import Stripe from "stripe";
import { getStripe } from "./stripe";
import { isOwnerEmail } from "../lib/plan";
import { spendEarnedFiat } from "../lib/pablo-tax";
import { creditFiat, spendFiat } from "../lib/fiat-wallet";
import { recordLegacyRecoveryEventTx, restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";
import {
  ITEM_CATALOG,
  ITEM_TYPES,
  PUBLIC_VENDING_ITEM_IDS,
  findCatalogItem,
  computeGearStats,
  requiresPhysicalBlackMarket,
  isConsumable,
  canInstallInto,
  type EquipSlotMap,
} from "../lib/item-catalog";
import { utilityKindForItem, findBatterySpec, ELECTRICITY_RATE_FIAT_PER_UNIT } from "../lib/utility-catalog";
import { recordUtilityRevenue } from "../lib/utility-revenue";
import { CRAFT_RECIPES, getCraftRecipe, isUtilityOutput } from "../lib/crafting-catalog";
import { getResourceDef } from "../lib/resource-catalog";
import { requireDesktopLink } from "../lib/desktop-link-auth";
import { getMarketIndex } from "./real-estate";
import { recordTowerCompanyRevenueTx } from "../lib/tower-finance";
import {
  TOWER_BUSINESS_STOCK_LINES,
  TOWER_GHOST_LISTING,
} from "@workspace/api-zod";
import {
  quoteTowerShopOrder,
  DEFAULT_TOWER_SHOP_PRICING_POLICY,
  TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY,
  towerShopRestockAvailableAt,
} from "../lib/tower-shop-pricing";
import { settleTowerShopSupplierOrderTx } from "../lib/tower-shop-finance";
import {
  chooseNpcShelfRestock,
  listNpcShopRestockCandidates,
} from "../lib/tower-shop-autopilot";
import {
  isBattery,
  batteryCapacity,
  getInstalledBatteries,
  fiatCostForChargeUnits,
  SELL_REFUND_PCT,
  ASSISTANT_TARGET_ID,
} from "../lib/battery";

const router: IRouter = Router();
// Keep aligned with the 6×4 inventory grid used by the native game.
const CARRIED_ITEM_CAPACITY = 24;
const PUBLIC_LOCKER_CAPACITY = 12;

const TOWER_BUSINESS_SHOP_LOCATIONS: Record<
  string,
  { floor: number; x: number; y: number; room?: "hallway" | "lobby" | "office"; officeUnitNumber?: number }
> = {
  "fish-store": { floor: 2, x: 22_884, y: 47_470 },
  "furniture-store": { floor: 2, x: 39_341, y: 47_470 },
  shadow_cafeteria: { floor: 2, x: 7_628, y: 15_556 },
  tower_clinic: { floor: 2, x: 22_884, y: 15_556 },
  tower_pharmacy: { floor: 2, x: 39_341, y: 15_556 },
  tower_terminal_repair: { floor: 2, x: 54_597, y: 15_556 },
  phone_store_f03: { floor: 3, x: 7_628, y: 15_556 },
  liquor_store: { floor: 3, x: 22_884, y: 15_556 },
  office_equipment_store: { floor: 3, x: 39_341, y: 15_556 },
  jewelry_store: { floor: 3, x: 7_628, y: 47_470 },
  tea_shop: { floor: 3, x: 22_884, y: 47_470 },
  formal_clothing_store: { floor: 3, x: 39_341, y: 47_470 },
  tool_store: { floor: 3, x: 54_597, y: 15_556 },
  shoe_store: { floor: 3, x: 54_597, y: 47_470 },
  music_shop: { floor: 4, x: 7_628, y: 15_556 },
  mirror_shop: { floor: 4, x: 22_884, y: 15_556 },
  lighting_store: { floor: 4, x: 39_341, y: 15_556 },
  cafe_f04: { floor: 4, x: 54_597, y: 15_556 },
  antique_shop_f04: { floor: 4, x: 7_628, y: 47_470 },
  record_store: { floor: 4, x: 22_884, y: 47_470 },
  book_store: { floor: 4, x: 39_341, y: 47_470 },
  restaurant: { floor: 5, x: 7_628, y: 15_556 },
  antique_shop_f05: { floor: 5, x: 22_884, y: 15_556 },
  phone_store_f05: { floor: 5, x: 39_341, y: 15_556 },
  tv_store: { floor: 5, x: 54_597, y: 15_556 },
  mattress_store: { floor: 5, x: 7_628, y: 47_470 },
  hostel: { floor: 5, x: 22_884, y: 47_470 },
  salon: { floor: 5, x: 39_341, y: 47_470 },
  barber: { floor: 5, x: 54_597, y: 47_470 },
  radio_station: { floor: 6, x: 7_628, y: 15_556, room: "office", officeUnitNumber: 1 },
  music_studio: { floor: 6, x: 22_884, y: 15_556, room: "office", officeUnitNumber: 1 },
  school: { floor: 6, x: 39_341, y: 15_556, room: "office", officeUnitNumber: 2 },
  art_supply_store: { floor: 6, x: 54_597, y: 15_556, room: "office", officeUnitNumber: 2 },
  meeting_room: { floor: 6, x: 7_628, y: 47_469, room: "office", officeUnitNumber: 3 },
  public_workspace: { floor: 6, x: 22_884, y: 47_469, room: "office", officeUnitNumber: 3 },
  study_hall: { floor: 6, x: 39_341, y: 47_469, room: "office", officeUnitNumber: 4 },
  flower_shop: { floor: 6, x: 54_597, y: 47_469, room: "office", officeUnitNumber: 4 },
  plant_store: { floor: 9, x: 39_341, y: 15_556 },
  android_replicant_repair: { floor: 8, x: 54_597, y: 15_556 },
  vespa_shop: { floor: 9, x: 54_597, y: 15_556 },
  vehicle_dealership: { floor: 1, x: 49_979_414, y: 50_006_505, room: "lobby" },
};
const TOWER_B1_BUSINESS_SHOP_LOCATIONS: Record<string, { level: 1; x: number; y: number }> = {
  tower_admin: { level: 1, x: 3_535, y: 6_364 },
  tower_shipping: { level: 1, x: 10_606, y: 6_364 },
  tower_trash: { level: 1, x: 17_677, y: 6_364 },
  tower_food_supply: { level: 1, x: 24_748, y: 6_364 },
  tower_construction: { level: 1, x: 3_535, y: 21_920 },
  tower_materials_supply: { level: 1, x: 10_606, y: 21_920 },
  tower_power: { level: 1, x: 17_677, y: 21_920 },
  tower_water: { level: 1, x: 24_748, y: 21_920 },
};
const TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM = 1_000;
const TOWER_SHOP_SHELF_CAPACITY_PER_ITEM = 100;
const TOWER_SHOP_ORDER_TRANSIT_MS = 5 * 60 * 1_000;
const TOWER_SHOP_DOCK_HANDOFF_MS = 12_000;
const TOWER_SHOP_COURIER_TRAVEL_MS = 15_000;
const NPC_SHOP_ORDER_HISTORY_MS = 30 * 24 * 60 * 60 * 1_000;
const TOWER_B1_SHOP_DOCK = { level: 1, x: 18_500, y: 7_000 };
const TOWER_SHOP_INTERACTION_RADIUS = 1_400;

let towerShopLogisticsTimer: NodeJS.Timeout | null = null;
let towerShopLogisticsTickRunning = false;

export function startTowerShopLogisticsScheduler(): void {
  if (towerShopLogisticsTimer) return;
  const tick = () => {
    if (towerShopLogisticsTickRunning) return;
    towerShopLogisticsTickRunning = true;
    runTowerShopLogisticsTick()
      .catch((error) => console.error("[TowerShop] autonomous logistics tick failed:", error))
      .finally(() => { towerShopLogisticsTickRunning = false; });
  };
  setTimeout(tick, 20_000);
  towerShopLogisticsTimer = setInterval(tick, 5_000);
}

async function runTowerShopLogisticsTick(now = new Date()): Promise<void> {
  await db.update(towerShopShipmentsTable).set({
    status: "at_dock",
    arrivedAtDockAt: now,
    updatedAt: now,
  }).where(and(
    eq(towerShopShipmentsTable.status, "supplier_processing"),
    sql`${towerShopShipmentsTable.supplierOrderedAt} <= ${new Date(now.getTime() - TOWER_SHOP_ORDER_TRANSIT_MS)}`,
  ));

  await db.update(towerShopShipmentsTable).set({
    status: "in_delivery",
    updatedAt: now,
  }).where(and(
    eq(towerShopShipmentsTable.status, "at_dock"),
    sql`${towerShopShipmentsTable.arrivedAtDockAt} <= ${new Date(now.getTime() - TOWER_SHOP_DOCK_HANDOFF_MS)}`,
  ));

  const ready = await db.select({ id: towerShopShipmentsTable.id })
    .from(towerShopShipmentsTable)
    .where(and(
      eq(towerShopShipmentsTable.status, "in_delivery"),
      sql`${towerShopShipmentsTable.updatedAt} <= ${new Date(now.getTime() - TOWER_SHOP_COURIER_TRAVEL_MS)}`,
    ))
    .limit(25);

  for (const { id } of ready) {
    await db.transaction(async (tx) => {
      const [shipment] = await tx.select().from(towerShopShipmentsTable)
        .where(eq(towerShopShipmentsTable.id, id)).for("update").limit(1);
      if (!shipment || shipment.status !== "in_delivery"
        || shipment.updatedAt.getTime() > now.getTime() - TOWER_SHOP_COURIER_TRAVEL_MS) return;

      for (const line of shipment.lines) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tower-shop-inventory:${shipment.businessKey}:${line.itemId}`}))`);
        const [stock] = await tx.select().from(towerShopInventoryTable)
          .where(and(
            eq(towerShopInventoryTable.businessKey, shipment.businessKey),
            eq(towerShopInventoryTable.itemId, line.itemId),
          )).for("update").limit(1);
        const stored = stock?.storedQuantity ?? 0;
        const capacity = stock?.storageCapacity || TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM;
        if (stored + line.quantity > capacity) return;
      }

      for (const line of shipment.lines) {
        await tx.insert(towerShopInventoryTable).values({
          businessKey: shipment.businessKey,
          itemId: line.itemId,
          storedQuantity: line.quantity,
          shelfQuantity: 0,
          storageCapacity: TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM,
          shelfCapacity: TOWER_SHOP_SHELF_CAPACITY_PER_ITEM,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [towerShopInventoryTable.businessKey, towerShopInventoryTable.itemId],
          set: {
            storedQuantity: sql`${towerShopInventoryTable.storedQuantity} + ${line.quantity}`,
            storageCapacity: sql`greatest(${towerShopInventoryTable.storageCapacity}, ${TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM})`,
            shelfCapacity: sql`greatest(${towerShopInventoryTable.shelfCapacity}, ${TOWER_SHOP_SHELF_CAPACITY_PER_ITEM})`,
            updatedAt: now,
          },
        });
      }
      await tx.update(towerShopShipmentsTable).set({
        status: "delivered",
        deliveredAtStoreAt: now,
        updatedAt: now,
      }).where(and(
        eq(towerShopShipmentsTable.id, id),
        eq(towerShopShipmentsTable.status, "in_delivery"),
      ));
    });
  }

  await runNpcTowerShopRestockTick(now).catch((error) => {
    console.error("[TowerShop] NPC shop restock tick failed:", error);
  });
  await runNpcTowerShopShelfRestockTick(now).catch((error) => {
    console.error("[TowerShop] NPC shelf restock tick failed:", error);
  });
}

async function runNpcTowerShopRestockTick(now: Date): Promise<void> {
  const itemIdsByBusiness = new Map<string, string[]>();
  for (const listing of TOWER_BUSINESS_STOCK_LINES) {
    const businessKey = listing.sellerBusinessKey;
    if (!businessKey || !TOWER_BUSINESS_SHOP_LOCATIONS[businessKey]) continue;
    const itemIds = itemIdsByBusiness.get(businessKey) ?? [];
    for (const itemId of listing.itemIds) {
      if (!itemIds.includes(itemId)) itemIds.push(itemId);
    }
    itemIdsByBusiness.set(businessKey, itemIds);
  }

  const market = await getMarketIndex();
  const btcMultiplierBps = Math.round(market.multiplier * 10_000);
  for (const [businessKey, itemIds] of itemIdsByBusiness) {
    const createdOrder = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tower-shop-npc-order:${businessKey}`}))`);
      const [activeShipment] = await tx.select({ id: towerShopShipmentsTable.id })
        .from(towerShopShipmentsTable)
        .where(and(
          eq(towerShopShipmentsTable.businessKey, businessKey),
          sql`${towerShopShipmentsTable.status} in ('supplier_processing', 'at_dock', 'in_delivery')`,
        ))
        .limit(1);
      if (activeShipment) return null;

      const stockRows = await tx.select().from(towerShopInventoryTable)
        .where(eq(towerShopInventoryTable.businessKey, businessKey));
      const stockByItem = new Map(stockRows.map((row) => [
        row.itemId,
        row.storedQuantity + row.shelfQuantity,
      ]));
      const capacityByItem = new Map(stockRows.map((row) => [
        row.itemId,
        row.storageCapacity || TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM,
      ]));
      const history = await tx.select({
        lines: towerShopShipmentsTable.lines,
        requestedAt: towerShopShipmentsTable.requestedAt,
      }).from(towerShopShipmentsTable)
        .where(and(
          eq(towerShopShipmentsTable.businessKey, businessKey),
          sql`${towerShopShipmentsTable.requestedAt} >= ${new Date(now.getTime() - NPC_SHOP_ORDER_HISTORY_MS)}`,
          sql`${towerShopShipmentsTable.status} <> 'cancelled'`,
        ))
        .orderBy(desc(towerShopShipmentsTable.requestedAt))
        .limit(500);

      const blockedItemIds = new Set<string>();
      for (const itemId of itemIds) {
        const item = findCatalogItem(itemId);
        const cooldownMs = item ? TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY[item.rarity] : undefined;
        if (!cooldownMs) continue;
        const lastOrder = history.find((shipment) =>
          shipment.lines.some((line) => line.itemId === itemId));
        if (lastOrder && towerShopRestockAvailableAt(lastOrder.requestedAt, cooldownMs) > now) {
          blockedItemIds.add(itemId);
        }
      }

      const candidates = listNpcShopRestockCandidates({
        itemIds,
        stockByItem,
        storageCapacityByItem: capacityByItem,
        blockedItemIds,
      });
      for (const candidate of candidates) {
        const item = findCatalogItem(candidate.itemId);
        if (!item || item.priceFiat <= 0) continue;

        const historicalDemand = history.reduce((total, shipment) => total
          + shipment.lines
            .filter((line) => line.itemId === candidate.itemId)
            .reduce((lineTotal, line) => lineTotal + line.quantity, 0), 0);
        const stockQuantity = stockByItem.get(candidate.itemId) ?? 0;
        const demandIndex = Math.min(10_000, 100 + historicalDemand * 100);
        const supplyIndex = Math.min(10_000, 100 + stockQuantity * 100);
        const requestKey = `tower-shop-npc:${businessKey}:${candidate.itemId}:${Math.floor(now.getTime() / 60_000)}`;
        const cooldownMs = TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY[item.rarity];

        for (let quantity = candidate.quantity; quantity >= 1; quantity--) {
          const quote = quoteTowerShopOrder({
            retailUnitPriceFiat: item.priceFiat,
            quantity,
            btcMultiplierBps,
            demandIndex,
            supplyIndex,
          });
          const result = await settleTowerShopSupplierOrderTx(tx, {
            businessKey,
            requestKey,
            requestedByUserId: null,
            lines: [{ itemId: candidate.itemId, quantity }],
            restockCooldowns: cooldownMs ? [{ itemId: candidate.itemId, cooldownMs }] : [],
            quote,
            btcMultiplierBps,
            demandIndex,
            supplyIndex,
            now,
          });
          if (result.ok) {
            if (result.duplicate) break;
            return {
              businessKey,
              itemId: candidate.itemId,
              quantity,
              balanceFiat: result.balanceFiat,
            };
          }
          if (result.reason === "tower_funds") return null;
          if (result.reason === "restock_cooldown") break;
        }
      }
      return null;
    });
    if (createdOrder) {
      console.info(
        `[TowerShop] NPC order: ${createdOrder.businessKey} ordered ${createdOrder.quantity} × ${createdOrder.itemId}; balance=${createdOrder.balanceFiat}`,
      );
      return;
    }
  }
}

async function runNpcTowerShopShelfRestockTick(now: Date): Promise<void> {
  const businessItems = new Map<string, Set<string>>();
  for (const listing of TOWER_BUSINESS_STOCK_LINES) {
    const businessKey = listing.sellerBusinessKey;
    if (!businessKey || !TOWER_BUSINESS_SHOP_LOCATIONS[businessKey]) continue;
    const itemIds = businessItems.get(businessKey) ?? new Set<string>();
    listing.itemIds.forEach((itemId) => itemIds.add(itemId));
    businessItems.set(businessKey, itemIds);
  }

  for (const [businessKey, itemIds] of businessItems) {
    for (const itemId of itemIds) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tower-shop-shelf:${businessKey}:${itemId}`}))`);
        const [stock] = await tx.select().from(towerShopInventoryTable).where(and(
          eq(towerShopInventoryTable.businessKey, businessKey),
          eq(towerShopInventoryTable.itemId, itemId),
        )).for("update").limit(1);
        if (!stock) return;
        const quantity = chooseNpcShelfRestock({
          stored: stock.storedQuantity,
          shelf: stock.shelfQuantity,
          shelfCapacity: stock.shelfCapacity || TOWER_SHOP_SHELF_CAPACITY_PER_ITEM,
        });
        if (quantity <= 0) return;
        await tx.update(towerShopInventoryTable).set({
          storedQuantity: sql`${towerShopInventoryTable.storedQuantity} - ${quantity}`,
          shelfQuantity: sql`${towerShopInventoryTable.shelfQuantity} + ${quantity}`,
          updatedAt: now,
        }).where(and(
          eq(towerShopInventoryTable.businessKey, businessKey),
          eq(towerShopInventoryTable.itemId, itemId),
          sql`${towerShopInventoryTable.storedQuantity} >= ${quantity}`,
          sql`${towerShopInventoryTable.shelfQuantity} + ${quantity} <= ${stock.shelfCapacity || TOWER_SHOP_SHELF_CAPACITY_PER_ITEM}`,
        ));
      });
    }
  }
}

function requireAuth(req: Request, res: any): string | null {
  if (!(req as any).isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  const id = (req as any).user?.id ?? null;
  if (!id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return id;
}

type GameItemsIdentity = {
  userId: string;
  email?: string | null;
  desktopLink: boolean;
  desktopLinkId?: string;
};

async function resolveGameItemsIdentity(req: Request, res: any): Promise<GameItemsIdentity | null> {
  if ((req as any).isAuthenticated?.() && (req as any).user?.id) {
    return {
      userId: String((req as any).user.id),
      email: (req as any).user.email,
      desktopLink: false,
    };
  }
  const link = await requireDesktopLink(req, res);
  if (!link) return null;
  const [user] = await db.select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, link.userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Desktop account is unavailable" });
    return null;
  }
  return { userId: link.userId, email: user.email, desktopLink: true, desktopLinkId: link.id };
}

function parseSlot(raw: unknown): number {
  const n = parseInt(String(raw ?? "0"), 10);
  if (isNaN(n) || n < 0 || n > 64) return 0;
  return n;
}

// Compensating refund for a FIAT spend whose item grant didn't land. The
// spend/grant pair isn't a single transaction, so any path that debits FIAT
// but fails to (or shouldn't) grant the item must put the florins back.
async function refundFiat(userId: string, amountFiat: number): Promise<void> {
  const accts = await db.select().from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")));
  const target = [...accts].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
  if (target) {
    await db.update(bankAccountsTable)
      .set({ balance: target.balance + amountFiat, updatedAt: new Date() })
      .where(eq(bankAccountsTable.id, target.id));
  }
}

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

// ─── Stackable quantity helpers (consumables only) ───────────────────────────
// Boolean-ownership gear continues to use plain insert/onConflictDoNothing.
// These operate on `quantity` and run inside a caller-supplied transaction so
// the buy/use/install legs stay atomic with whatever else they touch.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function checkCarriedCapacity(tx: Tx, userId: string, slot: number, itemId: string) {
  // Serialize acquisitions for one character so parallel requests cannot both
  // claim the final slot. hashtext collisions only cause extra serialization.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), ${slot})`);
  const rows = await tx.select({ itemId: playerInventoryTable.itemId })
    .from(playerInventoryTable)
    .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slot)));
  const alreadyHeld = rows.some((row) => row.itemId === itemId);
  return {
    ok: alreadyHeld || rows.length < CARRIED_ITEM_CAPACITY,
    usedSlots: rows.length,
    capacity: CARRIED_ITEM_CAPACITY,
    alreadyHeld,
  };
}

// Increment a consumable stack by `qty` (upsert: create at `qty` or add on top).
async function addConsumable(tx: Tx, userId: string, slot: number, itemId: string, qty: number, acquiredVia: string): Promise<void> {
  await tx.insert(playerInventoryTable)
    .values({ userId, slotIndex: slot, itemId, quantity: qty, acquiredVia })
    .onConflictDoUpdate({
      target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
      set: { quantity: sql`${playerInventoryTable.quantity} + ${qty}` },
    });
}

// Decrement a consumable stack by `qty`. Returns false (no-op) if the player
// doesn't hold enough. Deletes the row when the stack reaches zero so the
// inventory stays tidy.
async function removeConsumable(tx: Tx, userId: string, slot: number, itemId: string, qty: number): Promise<boolean> {
  const dec = await tx.update(playerInventoryTable)
    .set({ quantity: sql`${playerInventoryTable.quantity} - ${qty}` })
    .where(and(
      eq(playerInventoryTable.userId, userId),
      eq(playerInventoryTable.slotIndex, slot),
      eq(playerInventoryTable.itemId, itemId),
      sql`${playerInventoryTable.quantity} >= ${qty}`,
    ))
    .returning({ quantity: playerInventoryTable.quantity });
  if (dec.length === 0) return false;
  if (dec[0].quantity <= 0) {
    await tx.delete(playerInventoryTable)
      .where(and(
        eq(playerInventoryTable.userId, userId),
        eq(playerInventoryTable.slotIndex, slot),
        eq(playerInventoryTable.itemId, itemId),
      ));
  }
  return true;
}

// ─── Catalog (public) ───────────────────────────────────────────────────────
async function marketCatalogItems() {
  const market = await getMarketIndex();
  return {
    market: {
      multiplier: market.multiplier,
      asOf: market.asOf,
      status: market.status,
    },
    items: ITEM_CATALOG.map((item) => ({
      ...item,
      basePriceFiat: item.priceFiat,
      priceFiat: Math.max(1, Math.round(item.priceFiat * market.multiplier)),
    })),
  };
}

router.get("/items/catalog", async (_req, res) => {
  const catalog = await marketCatalogItems();
  res.json({ types: ITEM_TYPES, ...catalog });
});

router.get("/items/vending-catalog", async (_req, res) => {
  const catalog = await marketCatalogItems();
  const vendingItems = catalog.items.filter((item) =>
    PUBLIC_VENDING_ITEM_IDS.some((vendingId) => vendingId === item.id));
  const lines = TOWER_BUSINESS_STOCK_LINES.map((listing) => ({
    ...listing,
    items: catalog.items.filter((item) => listing.itemIds.includes(item.id)).map((item) => ({
      ...item,
      sellerBusinessKey: listing.sellerBusinessKey,
      sellerName: listing.sellerName,
    })),
  }));
  res.json({
    market: catalog.market,
    items: vendingItems.map((item) => ({
      ...item,
      sellerBusinessKey: "tower_vending",
      sellerName: "NIGHT PANTRY NETWORK",
    })),
    businessStock: { lines },
    ghost: TOWER_GHOST_LISTING,
  });
});

// ─── Inventory for a character save slot ──────────────────────────────────────
router.get("/items/inventory", async (req, res) => {
  const identity = await resolveGameItemsIdentity(req, res);
  if (!identity) return;
  const userId = identity.userId;
  // The linked desktop game is currently the primary character only. It
  // cannot use a device link to inspect other save slots.
  const slot = identity.desktopLink ? 0 : parseSlot(req.query.slot);
  try {
    await restoreLegacyRecoveryForUser(userId, identity.email);
    const rows = await db
      .select()
      .from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slot)));
    res.json({
      slot,
      itemIds: rows.map((r) => r.itemId),
      rows,
      usedSlots: rows.length,
      capacity: CARRIED_ITEM_CAPACITY,
    });
  } catch {
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// ─── Loadout + effective gear stats ──────────────────────────────────────────
async function loadoutFor(userId: string, slot: number): Promise<{ map: EquipSlotMap; equippedIds: string[] }> {
  const rows = await db
    .select()
    .from(playerLoadoutTable)
    .where(and(eq(playerLoadoutTable.userId, userId), eq(playerLoadoutTable.slotIndex, slot)));
  const map: EquipSlotMap = {};
  for (const r of rows) map[r.equipSlot as keyof EquipSlotMap] = r.itemId;
  return { map, equippedIds: rows.map((r) => r.itemId) };
}

router.get("/items/loadout", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const { map, equippedIds } = await loadoutFor(userId, slot);
    const [save] = await db.select().from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const data = (save?.data ?? {}) as Record<string, unknown>;
    const numberValue = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    res.json({
      slot,
      loadout: map,
      stats: computeGearStats(equippedIds),
      physical: {
        health: numberValue(data.hp, 100),
        maxHealth: numberValue(data.maxHp, 100),
        stamina: numberValue(data.energy, 100),
        strength: numberValue(data.strength, 10),
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to load loadout" });
  }
});

// ─── Buy with in-game FIAT ────────────────────────────────────────────────────
router.post("/items/tower-business/order", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const businessKey = String(req.body?.businessKey ?? "");
  const shop = TOWER_BUSINESS_SHOP_LOCATIONS[businessKey];
  const requestToken = String(req.body?.requestKey ?? "");
  const rawLines = req.body?.lines;
  if (!shop || !/^[A-Za-z0-9:_-]{8,100}$/.test(requestToken)
    || !Array.isArray(rawLines) || rawLines.length < 1 || rawLines.length > 20) {
    res.status(400).json({ error: "Invalid Tower shop order." });
    return;
  }

  const lines: Array<{ itemId: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const raw of rawLines) {
    const itemId = String(raw?.itemId ?? "");
    const quantity = Number(raw?.quantity);
    const listing = TOWER_BUSINESS_STOCK_LINES.find(
      (entry) => entry.sellerBusinessKey === businessKey && entry.itemIds.includes(itemId),
    );
    if (!listing || seen.has(itemId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      res.status(400).json({ error: "Order lines must be unique listed products with quantity from 1 to 100." });
      return;
    }
    seen.add(itemId);
    lines.push({ itemId, quantity });
  }

  const [presence] = await db.select().from(desktopOfficePresenceTable)
    .where(eq(desktopOfficePresenceTable.userId, link.userId))
    .limit(1);
  const presenceAgeMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  const distance = presence
    ? Math.hypot(presence.x - shop.x, presence.y - shop.y)
    : Number.POSITIVE_INFINITY;
  if (!presence || presence.linkId !== link.id || presence.floorNumber !== shop.floor
    || presence.room !== (shop.room ?? "hallway")
    || presenceAgeMs < 0 || presenceAgeMs > 10_000 || distance > 1_400) {
    res.status(403).json({ error: "Approach the Tower shop in the linked desktop game to place an order." });
    return;
  }

  try {
    const now = new Date();
    const market = await getMarketIndex();
    const btcMultiplierBps = Math.round(market.multiplier * 10_000);
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const history = await db.select({ lines: towerShopShipmentsTable.lines })
      .from(towerShopShipmentsTable)
      .where(and(
        eq(towerShopShipmentsTable.businessKey, businessKey),
        sql`${towerShopShipmentsTable.requestedAt} >= ${cutoff}`,
        sql`${towerShopShipmentsTable.status} <> 'cancelled'`,
      ))
      .orderBy(desc(towerShopShipmentsTable.requestedAt))
      .limit(500);
    const inventory = await db.select().from(towerShopInventoryTable)
      .where(eq(towerShopInventoryTable.businessKey, businessKey));
    const inventoryByItem = new Map(inventory.map((row) => [
      row.itemId,
      row.storedQuantity + row.shelfQuantity,
    ]));
    const demandByItem = new Map<string, number>();
    for (const shipment of history) {
      for (const line of shipment.lines) {
        demandByItem.set(line.itemId, (demandByItem.get(line.itemId) ?? 0) + line.quantity);
      }
    }

    const itemQuotes = lines.map((line) => {
      const item = findCatalogItem(line.itemId);
      if (!item || item.priceFiat <= 0) throw new Error("Catalog item has no valid price");
      const demandIndex = Math.min(10_000, 100 + (demandByItem.get(line.itemId) ?? 0) * 100);
      const supplyIndex = Math.min(10_000, 100 + (inventoryByItem.get(line.itemId) ?? 0) * 100);
      const quote = quoteTowerShopOrder({
        retailUnitPriceFiat: item.priceFiat,
        quantity: line.quantity,
        btcMultiplierBps,
        demandIndex,
        supplyIndex,
      });
      return { demandIndex, supplyIndex, quote };
    });
    const restockCooldowns = lines.flatMap((line) => {
      const item = findCatalogItem(line.itemId);
      const cooldownMs = item ? TOWER_SHOP_RESTOCK_COOLDOWN_MS_BY_RARITY[item.rarity] : undefined;
      return cooldownMs ? [{ itemId: line.itemId, cooldownMs }] : [];
    });
    const quantityTotal = lines.reduce((sum, line) => sum + line.quantity, 0);
    const goodsCostFiat = itemQuotes.reduce((sum, entry) => sum + entry.quote.goodsCostFiat, 0);
    const supplierCostFiat = itemQuotes.reduce((sum, entry) => sum + entry.quote.supplierCostFiat, 0);
    const deliveryFeeFiat = Math.ceil(
      ((DEFAULT_TOWER_SHOP_PRICING_POLICY.deliveryBaseFiat
        + DEFAULT_TOWER_SHOP_PRICING_POLICY.deliveryPerItemFiat * quantityTotal)
        * btcMultiplierBps) / 10_000,
    );
    const shopTotalFiat = goodsCostFiat + deliveryFeeFiat;
    const demandIndex = Math.round(itemQuotes.reduce((sum, entry) => sum + entry.demandIndex, 0) / itemQuotes.length);
    const supplyIndex = Math.round(itemQuotes.reduce((sum, entry) => sum + entry.supplyIndex, 0) / itemQuotes.length);
    if (![goodsCostFiat, supplierCostFiat, deliveryFeeFiat, shopTotalFiat].every(Number.isSafeInteger)) {
      throw new Error("Tower shop order exceeds supported FIAT range");
    }

    const result = await db.transaction((tx) => settleTowerShopSupplierOrderTx(tx, {
      businessKey,
      requestKey: `tower-shop:${link.id}:${requestToken}`,
      requestedByUserId: link.userId,
      lines,
      restockCooldowns,
      quote: {
        wholesaleRateBps: Math.round(itemQuotes.reduce((sum, entry) => sum + entry.quote.wholesaleRateBps, 0) / itemQuotes.length),
        marketRetailUnitFiat: 0,
        goodsCostFiat,
        deliveryFeeFiat,
        shopTotalFiat,
        supplierCostFiat,
        shippingCompanyMarginFiat: shopTotalFiat - supplierCostFiat,
      },
      btcMultiplierBps,
      demandIndex,
      supplyIndex,
      now,
    }));
    if (!result.ok) {
      if (result.reason === "tower_funds") {
        res.status(503).json({ error: "Tower working capital is temporarily unavailable." });
      } else {
        if (result.reason === "restock_cooldown") {
          res.status(429).json({
            error: "rare_item_restock_cooldown",
            itemId: result.itemId,
            nextAvailableAt: result.nextAvailableAt,
          });
          return;
        }
        res.status(402).json({
          error: "shop_funds",
          balanceFiat: result.balanceFiat,
          requiredFiat: result.requiredFiat,
        });
      }
      return;
    }
    res.status(result.duplicate ? 200 : 201).json({
      shipmentId: result.shipment.id,
      status: result.shipment.status,
      lines: result.shipment.lines,
      goodsCostFiat: result.shipment.goodsCostFiat,
      deliveryFeeFiat: result.shipment.deliveryFeeFiat,
      totalFiat: result.shipment.goodsCostFiat + result.shipment.deliveryFeeFiat,
      supplierCostFiat: result.shipment.supplierCostFiat,
      btcMultiplierBps: result.shipment.btcMultiplierBps,
      demandIndex: result.shipment.demandIndex,
      supplyIndex: result.shipment.supplyIndex,
      duplicate: result.duplicate,
    });
  } catch (error: any) {
    console.error("[TowerShop] supplier order failed:", error?.message);
    res.status(500).json({ error: "Supplier order failed; no shop order was charged." });
  }
});

// Supplier lead time is persisted from the order timestamp. Polling the logistics
// view advances eligible orders to the B1 dock, so offline shops still receive stock.
router.get("/items/tower-business/shipments/dock", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const now = new Date();
  try {
    await db.update(towerShopShipmentsTable).set({
      status: "at_dock",
      arrivedAtDockAt: now,
      updatedAt: now,
    }).where(and(
      eq(towerShopShipmentsTable.status, "supplier_processing"),
      sql`${towerShopShipmentsTable.supplierOrderedAt} <= ${new Date(now.getTime() - TOWER_SHOP_ORDER_TRANSIT_MS)}`,
    ));
    const rows = await db.select().from(towerShopShipmentsTable).where(or(
      eq(towerShopShipmentsTable.status, "at_dock"),
      eq(towerShopShipmentsTable.status, "in_delivery"),
    )).orderBy(desc(towerShopShipmentsTable.arrivedAtDockAt)).limit(50);
    const shipments = rows.map((shipment) => ({
      ...shipment,
      from: TOWER_B1_SHOP_DOCK,
      to: TOWER_BUSINESS_SHOP_LOCATIONS[shipment.businessKey],
      animation: "dock_to_shop",
    }));
    res.json({ shipments, dock: TOWER_B1_SHOP_DOCK });
  } catch (error: any) {
    console.error("[TowerShop] B1 dock snapshot failed:", error?.message);
    res.status(500).json({ error: "Could not load B1 shop freight." });
  }
});

router.get("/items/tower-business/:businessKey/shelf-stock", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const businessKey = String(req.params.businessKey ?? "");
  const shop = TOWER_BUSINESS_SHOP_LOCATIONS[businessKey];
  if (!shop || shop.floor < 2 || shop.floor > 6) {
    res.status(404).json({ error: "Unknown in-scope Tower shop." });
    return;
  }

  const allowedItemIds = new Set(TOWER_BUSINESS_STOCK_LINES
    .filter((line) => line.sellerBusinessKey === businessKey)
    .flatMap((line) => line.itemIds));
  try {
    const rows = await db.select().from(towerShopInventoryTable).where(and(
      eq(towerShopInventoryTable.businessKey, businessKey),
      sql`${towerShopInventoryTable.shelfQuantity} > 0`,
    ));
    const items = rows.flatMap((row) => {
      if (!allowedItemIds.has(row.itemId)) return [];
      const item = findCatalogItem(row.itemId);
      if (!item) return [];
      return [{
        itemId: item.id,
        name: item.name,
        itemType: item.type,
        shelfQuantity: row.shelfQuantity,
      }];
    });
    res.json({ businessKey, items });
  } catch (error: any) {
    console.error("[TowerShop] shelf stock snapshot failed:", error?.message);
    res.status(500).json({ error: "Could not load Tower shop shelf stock." });
  }
});

router.get("/items/tower-business/:businessKey/logistics", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const businessKey = String(req.params.businessKey ?? "");
  if (!TOWER_BUSINESS_SHOP_LOCATIONS[businessKey]) {
    res.status(404).json({ error: "Unknown Tower shop." });
    return;
  }
  const now = new Date();
  try {
    await db.update(towerShopShipmentsTable).set({
      status: "at_dock",
      arrivedAtDockAt: now,
      updatedAt: now,
    }).where(and(
      eq(towerShopShipmentsTable.businessKey, businessKey),
      eq(towerShopShipmentsTable.status, "supplier_processing"),
      sql`${towerShopShipmentsTable.supplierOrderedAt} <= ${new Date(now.getTime() - TOWER_SHOP_ORDER_TRANSIT_MS)}`,
    ));
    const [account] = await db.select().from(towerShopAccountsTable)
      .where(eq(towerShopAccountsTable.businessKey, businessKey)).limit(1);
    const inventory = await db.select().from(towerShopInventoryTable)
      .where(eq(towerShopInventoryTable.businessKey, businessKey));
    const shipments = await db.select().from(towerShopShipmentsTable)
      .where(eq(towerShopShipmentsTable.businessKey, businessKey))
      .orderBy(desc(towerShopShipmentsTable.requestedAt))
      .limit(50);
    res.json({
      businessKey,
      balanceFiat: account?.balanceFiat ?? 0,
      inventory,
      shipments,
      dock: TOWER_B1_SHOP_DOCK,
      transitMs: TOWER_SHOP_ORDER_TRANSIT_MS,
    });
  } catch (error: any) {
    console.error("[TowerShop] logistics snapshot failed:", error?.message);
    res.status(500).json({ error: "Could not load Tower shop logistics." });
  }
});

router.post("/items/tower-business/shipments/:shipmentId/pickup", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const shipmentId = String(req.params.shipmentId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) {
    res.status(400).json({ error: "Invalid shipment." });
    return;
  }
  const [presence] = await db.select().from(desktopBasementPresenceTable)
    .where(eq(desktopBasementPresenceTable.userId, link.userId)).limit(1);
  const ageMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  const distance = presence ? Math.hypot(presence.x - TOWER_B1_SHOP_DOCK.x, presence.y - TOWER_B1_SHOP_DOCK.y) : Infinity;
  if (!presence || presence.linkId !== link.id || presence.level !== TOWER_B1_SHOP_DOCK.level
    || ageMs < 0 || ageMs > 15_000 || distance > 650) {
    res.status(403).json({ error: "Move to the B1 shop-freight loading dock in the linked desktop game." });
    return;
  }
  const now = new Date();
  try {
    const [shipment] = await db.update(towerShopShipmentsTable).set({
      status: "in_delivery",
      updatedAt: now,
    }).where(and(
      eq(towerShopShipmentsTable.id, shipmentId),
      eq(towerShopShipmentsTable.status, "at_dock"),
    )).returning();
    if (!shipment) {
      res.status(409).json({ error: "Shipment is not waiting at the B1 dock." });
      return;
    }
    res.json({
      ok: true,
      shipmentId: shipment.id,
      businessKey: shipment.businessKey,
      status: shipment.status,
      lines: shipment.lines,
      from: TOWER_B1_SHOP_DOCK,
      to: TOWER_BUSINESS_SHOP_LOCATIONS[shipment.businessKey],
      animation: "dock_to_shop",
    });
  } catch (error: any) {
    console.error("[TowerShop] shipment pickup failed:", error?.message);
    res.status(500).json({ error: "Could not dispatch the Tower shop shipment." });
  }
});

router.post("/items/tower-business/shipments/:shipmentId/receive", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const shipmentId = String(req.params.shipmentId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(shipmentId)) {
    res.status(400).json({ error: "Invalid shipment." });
    return;
  }
  const [candidate] = await db.select().from(towerShopShipmentsTable)
    .where(eq(towerShopShipmentsTable.id, shipmentId)).limit(1);
  const shop = candidate ? TOWER_BUSINESS_SHOP_LOCATIONS[candidate.businessKey] : undefined;
  if (!candidate || !shop) {
    res.status(404).json({ error: "Unknown Tower shop shipment." });
    return;
  }
  const [presence] = await db.select().from(desktopOfficePresenceTable)
    .where(eq(desktopOfficePresenceTable.userId, link.userId)).limit(1);
  const ageMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  const distance = presence ? Math.hypot(presence.x - shop.x, presence.y - shop.y) : Infinity;
  if (!presence || presence.linkId !== link.id || presence.floorNumber !== shop.floor
    || presence.room !== (shop.room ?? "hallway")
    || ageMs < 0 || ageMs > 10_000 || distance > TOWER_SHOP_INTERACTION_RADIUS) {
    res.status(403).json({ error: "Move to the destination shop in the linked desktop game to receive its shipment." });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const [shipment] = await tx.select().from(towerShopShipmentsTable)
        .where(eq(towerShopShipmentsTable.id, shipmentId)).for("update").limit(1);
      if (!shipment || shipment.status !== "in_delivery") return { error: "Shipment is not in delivery." } as const;
      const lines = shipment.lines;
      for (const line of lines) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tower-shop-inventory:${shipment.businessKey}:${line.itemId}`}))`);
        const [stock] = await tx.select().from(towerShopInventoryTable)
          .where(and(
            eq(towerShopInventoryTable.businessKey, shipment.businessKey),
            eq(towerShopInventoryTable.itemId, line.itemId),
          )).for("update").limit(1);
        const stored = stock?.storedQuantity ?? 0;
        const capacity = stock?.storageCapacity || TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM;
        if (stored + line.quantity > capacity) {
          return {
            error: "Shop storage is full.",
            itemId: line.itemId,
            available: Math.max(0, capacity - stored),
            requested: line.quantity,
          } as const;
        }
      }
      for (const line of lines) {
        await tx.insert(towerShopInventoryTable).values({
          businessKey: shipment.businessKey,
          itemId: line.itemId,
          storedQuantity: line.quantity,
          shelfQuantity: 0,
          storageCapacity: TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM,
          shelfCapacity: TOWER_SHOP_SHELF_CAPACITY_PER_ITEM,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [towerShopInventoryTable.businessKey, towerShopInventoryTable.itemId],
          set: {
            storedQuantity: sql`${towerShopInventoryTable.storedQuantity} + ${line.quantity}`,
            storageCapacity: sql`greatest(${towerShopInventoryTable.storageCapacity}, ${TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM})`,
            shelfCapacity: sql`greatest(${towerShopInventoryTable.shelfCapacity}, ${TOWER_SHOP_SHELF_CAPACITY_PER_ITEM})`,
            updatedAt: now,
          },
        });
      }
      const [delivered] = await tx.update(towerShopShipmentsTable).set({
        status: "delivered",
        deliveredAtStoreAt: now,
        updatedAt: now,
      }).where(and(
        eq(towerShopShipmentsTable.id, shipmentId),
        eq(towerShopShipmentsTable.status, "in_delivery"),
      )).returning();
      if (!delivered) throw new Error("Shipment changed while being received");
      return { shipment: delivered };
    });
    if ("error" in result) {
      res.status(409).json(result);
      return;
    }
    res.json({ ok: true, shipmentId, status: "delivered", lines: result.shipment.lines });
  } catch (error: any) {
    console.error("[TowerShop] shipment receive failed:", error?.message);
    res.status(500).json({ error: "Could not receive the Tower shop shipment." });
  }
});

router.post("/items/tower-business/restock", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const businessKey = String(req.body?.businessKey ?? "");
  const shop = TOWER_BUSINESS_SHOP_LOCATIONS[businessKey];
  const itemId = String(req.body?.itemId ?? "");
  const quantity = Number(req.body?.quantity);
  if (!shop || !TOWER_BUSINESS_STOCK_LINES.some((line) =>
    line.sellerBusinessKey === businessKey && line.itemIds.includes(itemId))
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    res.status(400).json({ error: "Choose a stocked item and a quantity from 1 to 100." });
    return;
  }
  const [presence] = await db.select().from(desktopOfficePresenceTable)
    .where(eq(desktopOfficePresenceTable.userId, link.userId)).limit(1);
  const ageMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
  const distance = presence ? Math.hypot(presence.x - shop.x, presence.y - shop.y) : Infinity;
  if (!presence || presence.linkId !== link.id || presence.floorNumber !== shop.floor
    || presence.room !== "hallway" || ageMs < 0 || ageMs > 10_000 || distance > TOWER_SHOP_INTERACTION_RADIUS) {
    res.status(403).json({ error: "Move to the shop in the linked desktop game to restock its shelves." });
    return;
  }
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tower-shop-inventory:${businessKey}:${itemId}`}))`);
      const [stock] = await tx.select().from(towerShopInventoryTable).where(and(
        eq(towerShopInventoryTable.businessKey, businessKey),
        eq(towerShopInventoryTable.itemId, itemId),
      )).for("update").limit(1);
      if (!stock || stock.storedQuantity < quantity) {
        return { error: "Not enough units in shop storage.", storedQuantity: stock?.storedQuantity ?? 0 } as const;
      }
      const shelfCapacity = stock.shelfCapacity || TOWER_SHOP_SHELF_CAPACITY_PER_ITEM;
      if (stock.shelfQuantity + quantity > shelfCapacity) {
        return { error: "The shelf is full.", available: Math.max(0, shelfCapacity - stock.shelfQuantity) } as const;
      }
      const [updated] = await tx.update(towerShopInventoryTable).set({
        storedQuantity: sql`${towerShopInventoryTable.storedQuantity} - ${quantity}`,
        shelfQuantity: sql`${towerShopInventoryTable.shelfQuantity} + ${quantity}`,
        storageCapacity: stock.storageCapacity || TOWER_SHOP_STORAGE_CAPACITY_PER_ITEM,
        shelfCapacity,
        updatedAt: now,
      }).where(and(
        eq(towerShopInventoryTable.businessKey, businessKey),
        eq(towerShopInventoryTable.itemId, itemId),
        sql`${towerShopInventoryTable.storedQuantity} >= ${quantity}`,
        sql`${towerShopInventoryTable.shelfQuantity} + ${quantity} <= ${shelfCapacity}`,
      )).returning();
      if (!updated) return { error: "Stock changed; refresh and try again." } as const;
      return { stock: updated };
    });
    if ("error" in result) {
      res.status(409).json(result);
      return;
    }
    res.json({ ok: true, stock: result.stock });
  } catch (error: any) {
    console.error("[TowerShop] manual restock failed:", error?.message);
    res.status(500).json({ error: "Could not restock the Tower shop shelf." });
  }
});

router.post("/items/buy", async (req, res) => {
  const identity = await resolveGameItemsIdentity(req, res);
  if (!identity) return;
  const userId = identity.userId;
  const source = String(req.body?.source ?? "");
  const businessKey = String(req.body?.businessKey ?? "");
  if (identity.desktopLink && source !== "tower_vending" && source !== "tower_business") {
    res.status(403).json({ error: "Desktop purchases require an authorized Tower seller." });
    return;
  }
  let businessName = "";
  if (identity.desktopLink && req.body?.slot !== undefined && parseSlot(req.body.slot) !== 0) {
    res.status(403).json({ error: "The linked game can purchase only for the primary character." });
    return;
  }
  await restoreLegacyRecoveryForUser(userId, identity.email);
  const slot = identity.desktopLink ? 0 : parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) {
    res.status(400).json({ error: "Unknown item" });
    return;
  }
  if (source === "tower_vending" && !PUBLIC_VENDING_ITEM_IDS.some((vendingId) => vendingId === item.id)) {
    res.status(403).json({ error: "This item is not sold by Tower vending." });
    return;
  }
  const repeatablePlacementItem = item.type === "furniture" || item.type === "decor";
  let inventoryBusinessKey = "";
  if (source === "tower_business") {
    const shop = TOWER_BUSINESS_SHOP_LOCATIONS[businessKey];
    const b1Shop = TOWER_B1_BUSINESS_SHOP_LOCATIONS[businessKey];
    if (!identity.desktopLink || (!shop && !b1Shop)) {
      res.status(403).json({ error: "Business purchases require an in-person desktop shop interaction." });
      return;
    }
    const listing = TOWER_BUSINESS_STOCK_LINES.find(
      (entry) => entry.sellerBusinessKey === businessKey && entry.itemIds.includes(item.id),
    );
    if (!listing) {
      res.status(403).json({ error: "This shop does not stock that item." });
      return;
    }
    if (b1Shop) {
      const [presence] = await db.select().from(desktopBasementPresenceTable)
        .where(eq(desktopBasementPresenceTable.userId, userId))
        .limit(1);
      const ageMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
      const distance = presence
        ? Math.hypot(presence.x - b1Shop.x, presence.y - b1Shop.y)
        : Number.POSITIVE_INFINITY;
      if (!presence || presence.linkId !== identity.desktopLinkId
        || presence.level !== b1Shop.level || ageMs < 0 || ageMs > 10_000 || distance > 1_400) {
        res.status(403).json({ error: "Approach this B1 business in the linked desktop game before purchasing." });
        return;
      }
    } else {
      const [presence] = await db.select().from(desktopOfficePresenceTable)
        .where(eq(desktopOfficePresenceTable.userId, userId))
        .limit(1);
      const [presenceOfficeUnit] = presence?.officeUnitId
        ? await db.select({ unitNumber: shadowTowerOfficeUnitsTable.unitNumber })
          .from(shadowTowerOfficeUnitsTable)
          .where(eq(shadowTowerOfficeUnitsTable.id, presence.officeUnitId))
          .limit(1)
        : [];
      const presenceAgeMs = presence ? Date.now() - presence.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
      const distance = presence && shop
        ? Math.hypot(presence.x - shop.x, presence.y - shop.y)
        : Number.POSITIVE_INFINITY;
      if (!presence || !shop || presence.linkId !== identity.desktopLinkId
        || presence.floorNumber !== shop.floor || presence.room !== (shop.room ?? "hallway")
        || (shop.officeUnitNumber !== undefined && presenceOfficeUnit?.unitNumber !== shop.officeUnitNumber)
        || presenceAgeMs < 0 || presenceAgeMs > 10_000 || distance > 1_400) {
        res.status(403).json({ error: "Approach this Tower shop before purchasing." });
        return;
      }
    }
    if (shop) inventoryBusinessKey = businessKey;
      businessName = listing.sellerName ?? "Tower shop";
  }
  if (requiresPhysicalBlackMarket(item) && source !== "black_market" && source !== "tower_business") {
    res.status(403).json({ error: "Find the physical black-market dealer in Shadow Tower." });
    return;
  }
  const market = await getMarketIndex();
  const marketPriceFiat = Math.max(1, Math.round(item.priceFiat * market.multiplier));

  // ─── Consumable branch: stack a quantity instead of one-time ownership ─────
  if (isConsumable(item)) {
    const qtyRaw = Number(req.body?.qty ?? 1);
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(99, Math.floor(qtyRaw))) : 1;
    const email = identity.email ?? undefined;

    // Owners get consumables granted free.
    if (isOwnerEmail(email)) {
      const capacity = await db.transaction(async (tx) => {
        const check = await checkCarriedCapacity(tx, userId, slot, item.id);
        if (check.ok) await addConsumable(tx, userId, slot, item.id, qty, "grant");
        return check;
      });
      if (!capacity.ok) {
        res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...capacity });
        return;
      }
      res.json({ owned: true, granted: true, quantity: qty });
      return;
    }

    const totalPrice = marketPriceFiat * qty;
    try {
      const paid = await db.transaction(async (tx) => {
        const capacity = await checkCarriedCapacity(tx, userId, slot, item.id);
        if (!capacity.ok) return { kind: "capacity" as const, capacity };
        const [stock] = inventoryBusinessKey
          ? await tx.select().from(towerShopInventoryTable).where(and(
            eq(towerShopInventoryTable.businessKey, inventoryBusinessKey),
            eq(towerShopInventoryTable.itemId, item.id),
          )).for("update").limit(1)
          : [];
        if (inventoryBusinessKey && (!stock || stock.shelfQuantity < qty)) {
          return { kind: "stock" as const, available: stock?.shelfQuantity ?? 0 };
        }
        const result = await spendFiat(tx, {
          userId,
          amountFiat: totalPrice,
          description: `Armory: ${item.name} ×${qty}`,
          kind: "item_purchase",
        });
        if (!result.ok) return { kind: "fiat" as const, spendable: result.spendable };
        if (inventoryBusinessKey) {
          const [updatedStock] = await tx.update(towerShopInventoryTable).set({
            shelfQuantity: sql`${towerShopInventoryTable.shelfQuantity} - ${qty}`,
            updatedAt: new Date(),
          }).where(and(
            eq(towerShopInventoryTable.businessKey, inventoryBusinessKey),
            eq(towerShopInventoryTable.itemId, item.id),
            sql`${towerShopInventoryTable.shelfQuantity} >= ${qty}`,
          )).returning({ itemId: towerShopInventoryTable.itemId });
          if (!updatedStock) throw new Error("Tower shop shelf stock changed during purchase");
        }
        await addConsumable(tx, userId, slot, item.id, qty, "fiat");
        if (source === "tower_business") {
          await recordTowerCompanyRevenueTx(tx, {
            eventKey: `tower-business-sale:${randomUUID()}`,
            category: businessKey,
            userId,
            amountFiat: totalPrice,
            description: `${businessName} sale: ${item.name} ×${qty}`,
          });
        }
        if (source === "tower_vending") {
          await recordLegacyRecoveryEventTx(tx, {
            userId,
            eventKey: `tower-vending:${randomUUID()}`,
            kind: "tower_vending_item",
            itemId: item.id,
            slotIndex: slot,
            quantity: qty,
            amountFiat: totalPrice,
          });
        }
        return { kind: "success" as const, ...result };
      });
      if (paid.kind === "capacity") {
        res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...paid.capacity });
        return;
      }
      if (paid.kind === "stock") {
        res.status(409).json({ error: "tower_shop_sold_out", available: paid.available });
        return;
      }
      if (paid.kind === "fiat") {
        res.status(402).json({ error: "insufficient_fiat", required: totalPrice, spendable: paid.spendable });
        return;
      }
      // Batteries & fuel are PABLO POWER & GAS goods — route the sale to the
      // utility monopoly's revenue ledger (fire-and-forget; never blocks the buy).
      const utilKind = utilityKindForItem(item.id);
      if (utilKind) {
        void recordUtilityRevenue({
          userId,
          kind: utilKind,
          itemId: item.id,
          units: qty,
          amountFiat: totalPrice,
          description: `${item.name} ×${qty}`,
        });
      }
      res.json({ owned: true, fiat: totalPrice, quantity: qty, newBalance: paid.newBalance });
    } catch (err: any) {
      console.error("[Items] atomic consumable buy failed:", err?.message);
      res.status(500).json({ error: "Purchase failed — no florins were charged." });
    }
    return;
  }

  // Already owned in this slot? Items are one-time — never charge twice.
  const existing = await db
    .select({ id: playerInventoryTable.id })
    .from(playerInventoryTable)
    .where(and(
      eq(playerInventoryTable.userId, userId),
      eq(playerInventoryTable.slotIndex, slot),
      eq(playerInventoryTable.itemId, item.id),
    ))
    .limit(1);
  if (existing.length > 0 && !repeatablePlacementItem) {
    res.json({ owned: true, alreadyOwned: true });
    return;
  }

  // Owners get everything granted free.
  const email = identity.email ?? undefined;
  if (isOwnerEmail(email)) {
    const grant = await db.transaction(async (tx) => {
      const capacity = await checkCarriedCapacity(tx, userId, slot, item.id);
      if (!capacity.ok) return { capacity };
      const insert = tx.insert(playerInventoryTable)
        .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: "grant" });
      const rows = repeatablePlacementItem
        ? await insert.onConflictDoUpdate({
          target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
          set: { quantity: sql`${playerInventoryTable.quantity} + 1` },
        }).returning({ quantity: playerInventoryTable.quantity })
        : await insert.onConflictDoNothing().returning({ quantity: playerInventoryTable.quantity });
      return { rows };
    });
    if ("capacity" in grant) {
      res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...grant.capacity });
      return;
    }
    res.json({ owned: true, granted: true, quantity: grant.rows[0]?.quantity ?? 1 });
    return;
  }

  // Negotiator I/II skill discount — read skills from the player's save slot.
  let effectivePrice = marketPriceFiat;
  try {
    const [saveRow] = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const skills = (saveRow?.data as any)?.skills as string[] | undefined;
    if (Array.isArray(skills)) {
      if (skills.includes("business.negotiator_2")) {
        effectivePrice = Math.floor(marketPriceFiat * 0.90);
      } else if (skills.includes("business.negotiator_1")) {
        effectivePrice = Math.floor(marketPriceFiat * 0.95);
      }
    }
  } catch { /* best-effort — fall back to full price */ }

  try {
    const paid = await db.transaction(async (tx) => {
      const capacity = await checkCarriedCapacity(tx, userId, slot, item.id);
      if (!capacity.ok) return { kind: "capacity" as const, capacity };
      const [stock] = inventoryBusinessKey
        ? await tx.select().from(towerShopInventoryTable).where(and(
          eq(towerShopInventoryTable.businessKey, inventoryBusinessKey),
          eq(towerShopInventoryTable.itemId, item.id),
        )).for("update").limit(1)
        : [];
      if (inventoryBusinessKey && (!stock || stock.shelfQuantity < 1)) {
        return { kind: "stock" as const, available: stock?.shelfQuantity ?? 0 };
      }
      const result = await spendFiat(tx, {
        userId,
        amountFiat: effectivePrice,
        description: `Armory: ${item.name}`,
        kind: "item_purchase",
      });
      if (!result.ok) return { kind: "fiat" as const, spendable: result.spendable };
      if (inventoryBusinessKey) {
        const [updatedStock] = await tx.update(towerShopInventoryTable).set({
          shelfQuantity: sql`${towerShopInventoryTable.shelfQuantity} - 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(towerShopInventoryTable.businessKey, inventoryBusinessKey),
          eq(towerShopInventoryTable.itemId, item.id),
          sql`${towerShopInventoryTable.shelfQuantity} >= 1`,
        )).returning({ itemId: towerShopInventoryTable.itemId });
        if (!updatedStock) throw new Error("Tower shop shelf stock changed during purchase");
      }
      const inventoryInsert = tx
        .insert(playerInventoryTable)
        .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: "fiat" });
      const inserted = repeatablePlacementItem
        ? await inventoryInsert.onConflictDoUpdate({
          target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
          set: { quantity: sql`${playerInventoryTable.quantity} + 1` },
        }).returning({ quantity: playerInventoryTable.quantity })
        : await inventoryInsert.onConflictDoNothing().returning({ quantity: playerInventoryTable.quantity });
      if (inserted.length === 0) throw new Error("ITEM_ALREADY_OWNED");
      if (source === "tower_business") {
        await recordTowerCompanyRevenueTx(tx, {
          eventKey: `tower-business-sale:${randomUUID()}`,
          category: businessKey,
          userId,
          amountFiat: effectivePrice,
          description: `${businessName} sale: ${item.name}`,
        });
      }
      if (source === "tower_vending") {
        await recordLegacyRecoveryEventTx(tx, {
          userId,
          eventKey: `tower-vending:${randomUUID()}`,
          kind: "tower_vending_item",
          itemId: item.id,
          slotIndex: slot,
          quantity: 1,
          amountFiat: effectivePrice,
        });
      }
      return { kind: "success" as const, ...result, quantity: inserted[0]?.quantity ?? 1 };
    });
    if (paid.kind === "capacity") {
      res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...paid.capacity });
      return;
    }
    if (paid.kind === "stock") {
      res.status(409).json({ error: "tower_shop_sold_out", available: paid.available });
      return;
    }
    if (paid.kind === "fiat") {
      res.status(402).json({ error: "insufficient_fiat", required: effectivePrice, spendable: paid.spendable });
      return;
    }
    res.json({ owned: true, fiat: effectivePrice, quantity: paid.quantity, newBalance: paid.newBalance });
  } catch (err: any) {
    if (err?.message === "ITEM_ALREADY_OWNED") {
      res.json({ owned: true, alreadyOwned: true });
      return;
    }
    console.error("[Items] atomic buy failed:", err?.message);
    res.status(500).json({ error: "Purchase failed — no florins were charged." });
    return;
  }
});

// Any shop can buy any catalog item back. The seller gets the configured
// buyback markup over the live catalog-market value.
router.post("/items/sell", async (req, res) => {
  const identity = await resolveGameItemsIdentity(req, res);
  if (!identity) return;
  if (identity.desktopLink && req.body?.slot !== undefined && parseSlot(req.body.slot) !== 0) {
    res.status(403).json({ error: "The linked game can sell only from the primary character." });
    return;
  }
  const userId = identity.userId;
  const slot = identity.desktopLink ? 0 : parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  const qtyRaw = Number(req.body?.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(99, Math.floor(qtyRaw))) : 1;
  try {
    const market = await getMarketIndex();
    const unitPayout = Math.max(1, Math.round(item.priceFiat * market.multiplier * 1.2));
    const result = await db.transaction(async (tx) => {
      const [held] = await tx.select().from(playerInventoryTable)
        .where(and(
          eq(playerInventoryTable.userId, userId),
          eq(playerInventoryTable.slotIndex, slot),
          eq(playerInventoryTable.itemId, item.id),
        ))
        .for("update").limit(1);
      if (!held || held.quantity < qty) return { error: "quantity" as const };
      if (!isConsumable(item)) {
        const equipped = await tx.select({ id: playerLoadoutTable.id }).from(playerLoadoutTable)
          .where(and(
            eq(playerLoadoutTable.userId, userId),
            eq(playerLoadoutTable.slotIndex, slot),
            eq(playerLoadoutTable.itemId, item.id),
          )).limit(1);
        if (equipped.length) return { error: "equipped" as const };
      }
      const remaining = held.quantity - qty;
      if (remaining === 0) {
        await tx.delete(playerInventoryTable).where(eq(playerInventoryTable.id, held.id));
      } else {
        await tx.update(playerInventoryTable).set({ quantity: remaining })
          .where(eq(playerInventoryTable.id, held.id));
      }
      const credited = await creditFiat(tx, {
        userId,
        amountFiat: unitPayout * qty,
        description: `Shop buyback: ${item.name} ×${qty}`,
        kind: "item_buyback",
      });
      return { ok: true as const, remaining, payout: unitPayout * qty, newBalance: credited.newBalance };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error === "equipped" ? "Unequip this item before selling it." : "You don't have that quantity to sell." });
      return;
    }
    res.json({ ok: true, itemId: item.id, quantity: qty, remaining: result.remaining, payoutFiat: result.payout, newBalance: result.newBalance });
  } catch (error) {
    console.error("[Items] buyback failed:", error);
    res.status(500).json({ error: "Shop buyback failed." });
  }
});

// ─── Retired one-time USD checkout ────────────────────────────────────────────
router.post("/items/checkout", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  res.status(410).json({
    error: "monthly_subscriptions_only",
    message: "USD checkout is limited to monthly service plans. Buy in-game items with FIAT.",
  });
});

// ─── Equip / unequip ─────────────────────────────────────────────────────────
router.post("/items/equip", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) {
    res.status(400).json({ error: "Unknown item" });
    return;
  }
  if (!item.equipSlot) {
    res.status(400).json({ error: "This item can't be equipped." });
    return;
  }
  // Must own it in this slot.
  const owned = await db
    .select({ id: playerInventoryTable.id })
    .from(playerInventoryTable)
    .where(and(
      eq(playerInventoryTable.userId, userId),
      eq(playerInventoryTable.slotIndex, slot),
      eq(playerInventoryTable.itemId, item.id),
    ))
    .limit(1);
  if (owned.length === 0) {
    res.status(400).json({ error: "You don't own this item." });
    return;
  }
  try {
    await db.insert(playerLoadoutTable)
      .values({ userId, slotIndex: slot, equipSlot: item.equipSlot, itemId: item.id })
      .onConflictDoUpdate({
        target: [playerLoadoutTable.userId, playerLoadoutTable.slotIndex, playerLoadoutTable.equipSlot],
        set: { itemId: item.id, equippedAt: new Date() },
      });
    const { map, equippedIds } = await loadoutFor(userId, slot);
    res.json({ ok: true, loadout: map, stats: computeGearStats(equippedIds) });
  } catch {
    res.status(500).json({ error: "Failed to equip" });
  }
});

router.post("/items/unequip", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const equipSlot = String(req.body?.equipSlot ?? "");
  if (!equipSlot) {
    res.status(400).json({ error: "equipSlot required" });
    return;
  }
  try {
    await db.delete(playerLoadoutTable)
      .where(and(
        eq(playerLoadoutTable.userId, userId),
        eq(playerLoadoutTable.slotIndex, slot),
        eq(playerLoadoutTable.equipSlot, equipSlot),
      ));
    const { map, equippedIds } = await loadoutFor(userId, slot);
    res.json({ ok: true, loadout: map, stats: computeGearStats(equippedIds) });
  } catch {
    res.status(500).json({ error: "Failed to unequip" });
  }
});

// ─── Webhook fulfillment (called from stripe.ts) ─────────────────────────────
// Grant a premium item once the card payment is actually settled.
export async function handleItemWebhookEvent(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.type !== "item") return;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (session.payment_status !== "paid") {
      console.log(`[Items] Session ${session.id} completed but unpaid (${session.payment_status}); awaiting settlement.`);
      return;
    }
    const userId = session.client_reference_id || session.metadata?.userId;
    const itemId = session.metadata?.itemId;
    const slot = parseSlot(session.metadata?.slotIndex);
    if (!userId || !itemId || !findCatalogItem(itemId)) return;
    await db.insert(playerInventoryTable)
      .values({ userId, slotIndex: slot, itemId, acquiredVia: "stripe" })
      .onConflictDoNothing();
    console.log(`[Items] Purchase granted — user ${userId}, item ${itemId}, slot ${slot}`);
  }
}

// ─── Home storage locker ─────────────────────────────────────────────────────
// A personal stash kept "at home" but keyed by (userId + slotIndex) only, so it
// follows the player across every city. An item lives in EITHER carried
// inventory or the locker, never both — deposit/withdraw atomically moves the
// single ownership row between the two tables.
router.get("/items/storage", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const rows = await db
      .select()
      .from(playerStorageTable)
      .where(and(eq(playerStorageTable.userId, userId), eq(playerStorageTable.slotIndex, slot)));
    res.json({ slot, itemIds: rows.map((r) => r.itemId), rows });
  } catch {
    res.status(500).json({ error: "Failed to load storage" });
  }
});

// Move an owned item from carried inventory → the home locker.
router.post("/items/storage/deposit", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  // The home locker tracks one-time boolean gear only — it has no quantity
  // column, so stashing a consumable stack would collapse it to a single unit.
  // Consumables live in the carried inventory (with quantities) instead.
  if (isConsumable(item)) { res.status(400).json({ error: "Consumables can't be stored in the locker." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      // Can't stash gear you're currently wearing — the loadout points at the
      // inventory row, so unequip first or it would dangle.
      const equipped = await tx
        .select({ id: playerLoadoutTable.id })
        .from(playerLoadoutTable)
        .where(and(
          eq(playerLoadoutTable.userId, userId),
          eq(playerLoadoutTable.slotIndex, slot),
          eq(playerLoadoutTable.itemId, item.id),
        ))
        .limit(1);
      if (equipped.length > 0) return { error: "equipped" as const };
      const removed = await tx
        .delete(playerInventoryTable)
        .where(and(
          eq(playerInventoryTable.userId, userId),
          eq(playerInventoryTable.slotIndex, slot),
          eq(playerInventoryTable.itemId, item.id),
        ))
        .returning();
      if (removed.length === 0) return { error: "not_owned" as const };
      // Safety net: if an equip raced in after the check above, the loadout
      // could now point at the row we just deleted. Clear any reference to this
      // item in the same tx so the loadout can never dangle (gear stats are
      // recomputed server-side from the loadout, so a stale ref would desync).
      await tx
        .delete(playerLoadoutTable)
        .where(and(
          eq(playerLoadoutTable.userId, userId),
          eq(playerLoadoutTable.slotIndex, slot),
          eq(playerLoadoutTable.itemId, item.id),
        ));
      await tx
        .insert(playerStorageTable)
        .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: removed[0].acquiredVia })
        .onConflictDoNothing();
      return { ok: true as const };
    });
    if ("error" in result) {
      if (result.error === "equipped") { res.status(409).json({ error: "Unequip this item before storing it." }); return; }
      res.status(404).json({ error: "You don't carry that item." });
      return;
    }
    res.json({ ok: true, stored: item.id });
  } catch (e: any) {
    console.error("[Items] deposit failed:", e?.message);
    res.status(500).json({ error: "Failed to store item" });
  }
});

// Move an item from the home locker → carried inventory.
router.post("/items/storage/withdraw", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const capacity = await checkCarriedCapacity(tx, userId, slot, item.id);
      if (!capacity.ok) return { error: "full" as const, capacity };
      const removed = await tx
        .delete(playerStorageTable)
        .where(and(
          eq(playerStorageTable.userId, userId),
          eq(playerStorageTable.slotIndex, slot),
          eq(playerStorageTable.itemId, item.id),
        ))
        .returning();
      if (removed.length === 0) return { error: "not_stored" as const };
      // Defensive: a consumable should never reach the locker (deposit blocks it),
      // but if a legacy row exists, restore it as a single stacked unit rather
      // than a quantity-less boolean row.
      if (isConsumable(item)) {
        await addConsumable(tx, userId, slot, item.id, 1, removed[0].acquiredVia ?? "grant");
        return { ok: true as const };
      }
      await tx
        .insert(playerInventoryTable)
        .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: removed[0].acquiredVia })
        .onConflictDoNothing();
      return { ok: true as const };
    });
    if ("error" in result) {
      if (result.error === "full") {
        res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...result.capacity });
        return;
      }
      res.status(404).json({ error: "That item isn't in your locker." });
      return;
    }
    res.json({ ok: true, withdrawn: item.id });
  } catch (e: any) {
    console.error("[Items] withdraw failed:", e?.message);
    res.status(500).json({ error: "Failed to withdraw item" });
  }
});

// Publicly located lockers are still owner-private; user and character scope
// always come from the authenticated session, never from the request body.
router.get("/items/public-locker", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const rows = await db.select().from(publicLockerStorageTable)
      .where(and(eq(publicLockerStorageTable.userId, userId), eq(publicLockerStorageTable.slotIndex, slot)));
    res.json({ slot, rows, itemIds: rows.map((row) => row.itemId), usedSlots: rows.length, capacity: PUBLIC_LOCKER_CAPACITY });
  } catch {
    res.status(500).json({ error: "Failed to load public locker" });
  }
});

router.post("/items/public-locker/deposit", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), ${slot})`);
      const [held] = await tx.select().from(playerInventoryTable).where(and(
        eq(playerInventoryTable.userId, userId),
        eq(playerInventoryTable.slotIndex, slot),
        eq(playerInventoryTable.itemId, item.id),
      )).for("update").limit(1);
      if (!held) return { error: "not_owned" as const };
      if (!isConsumable(item)) {
        const equipped = await tx.select({ id: playerLoadoutTable.id }).from(playerLoadoutTable).where(and(
          eq(playerLoadoutTable.userId, userId),
          eq(playerLoadoutTable.slotIndex, slot),
          eq(playerLoadoutTable.itemId, item.id),
        )).limit(1);
        if (equipped.length) return { error: "equipped" as const };
      }
      const lockerRows = await tx.select({ itemId: publicLockerStorageTable.itemId }).from(publicLockerStorageTable)
        .where(and(eq(publicLockerStorageTable.userId, userId), eq(publicLockerStorageTable.slotIndex, slot)));
      const alreadyStored = lockerRows.some((row) => row.itemId === item.id);
      if (!alreadyStored && lockerRows.length >= PUBLIC_LOCKER_CAPACITY) return { error: "full" as const };
      await tx.delete(playerInventoryTable).where(eq(playerInventoryTable.id, held.id));
      await tx.insert(publicLockerStorageTable).values({
        userId, slotIndex: slot, itemId: item.id, quantity: held.quantity, acquiredVia: held.acquiredVia,
      }).onConflictDoUpdate({
        target: [publicLockerStorageTable.userId, publicLockerStorageTable.slotIndex, publicLockerStorageTable.itemId],
        set: { quantity: sql`${publicLockerStorageTable.quantity} + ${held.quantity}` },
      });
      return { ok: true as const, quantity: held.quantity };
    });
    if ("error" in result) {
      const status = result.error === "not_owned" ? 404 : 409;
      res.status(status).json({ error: result.error === "full" ? "Public locker is full." : result.error === "equipped" ? "Unequip this item before storing it." : "You don't carry that item.", capacity: PUBLIC_LOCKER_CAPACITY });
      return;
    }
    res.json({ ok: true, stored: item.id, quantity: result.quantity });
  } catch (error) {
    console.error("[Items] public locker deposit failed:", error);
    res.status(500).json({ error: "Failed to store item" });
  }
});

router.post("/items/public-locker/withdraw", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), ${slot})`);
      const [stored] = await tx.select().from(publicLockerStorageTable).where(and(
        eq(publicLockerStorageTable.userId, userId),
        eq(publicLockerStorageTable.slotIndex, slot),
        eq(publicLockerStorageTable.itemId, item.id),
      )).for("update").limit(1);
      if (!stored) return { error: "not_stored" as const };
      const carried = await tx.select({ itemId: playerInventoryTable.itemId }).from(playerInventoryTable).where(and(
        eq(playerInventoryTable.userId, userId),
        eq(playerInventoryTable.slotIndex, slot),
      ));
      const alreadyHeld = carried.some((row) => row.itemId === item.id);
      if (!alreadyHeld && carried.length >= CARRIED_ITEM_CAPACITY) {
        return { error: "full" as const, usedSlots: carried.length };
      }
      await tx.delete(publicLockerStorageTable).where(eq(publicLockerStorageTable.id, stored.id));
      await tx.insert(playerInventoryTable).values({
        userId, slotIndex: slot, itemId: item.id, quantity: stored.quantity, acquiredVia: stored.acquiredVia,
      }).onConflictDoUpdate({
        target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
        set: { quantity: sql`${playerInventoryTable.quantity} + ${stored.quantity}` },
      });
      return { ok: true as const, quantity: stored.quantity };
    });
    if ("error" in result) {
      res.status(result.error === "not_stored" ? 404 : 409).json({
        error: result.error === "full" ? "Inventory full. Store an item first." : "That item isn't in your public locker.",
        ...(result.error === "full" ? { usedSlots: result.usedSlots, capacity: CARRIED_ITEM_CAPACITY } : {}),
      });
      return;
    }
    res.json({ ok: true, withdrawn: item.id, quantity: result.quantity });
  } catch (error) {
    console.error("[Items] public locker withdrawal failed:", error);
    res.status(500).json({ error: "Failed to withdraw item" });
  }
});

// ─── Consume a stackable item (use / craft primitive) ────────────────────────
// Applies declared gameplay effects and decrements stock in one transaction.
router.post("/items/consume", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  if (!isConsumable(item)) { res.status(400).json({ error: "That item isn't a consumable." }); return; }
  const qtyRaw = Number(req.body?.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(99, Math.floor(qtyRaw))) : 1;
  if (!item.useEffect) { res.status(400).json({ error: "This supply is installed or crafted, not consumed directly." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, userId),
        eq(salarymanSavesTable.slotIndex, slot),
      )).for("update").limit(1);
      if (!save) return { error: "character_missing" as const };
      const ok = await removeConsumable(tx, userId, slot, item.id, qty);
      if (!ok) return { error: "inventory" as const };
      const data = { ...(save.data as Record<string, any>) };
      const effect = item.useEffect!;
      if (effect.stamina) {
        const current = typeof data.energy === "number" ? data.energy : 100;
        data.energy = Math.min(100, current + effect.stamina * qty);
      }
      if (effect.workIncomePct && effect.workIncomeUses) {
        data.workIncomeBoost = {
          percent: effect.workIncomePct,
          remainingJobs: effect.workIncomeUses * qty,
          sourceItemId: item.id,
        };
      }
      if (effect.skillGrant) {
        const skills = Array.isArray(data.skills) ? [...data.skills] : [];
        if (!skills.includes(effect.skillGrant)) skills.push(effect.skillGrant);
        data.skills = skills;
      }
      await tx.update(salarymanSavesTable).set({ data }).where(eq(salarymanSavesTable.id, save.id));
      return {
        ok: true as const,
        energy: typeof data.energy === "number" ? data.energy : undefined,
        workIncomeBoost: data.workIncomeBoost,
        skillGranted: effect.skillGrant,
      };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error === "inventory" ? "You don't have enough of that." : "Create a character first." });
      return;
    }
    res.json({ ...result, consumed: item.id, qty });
  } catch (e: any) {
    console.error("[Items] consume failed:", e?.message);
    res.status(500).json({ error: "Failed to consume item" });
  }
});

// ─── Crafting (faction-agnostic, server-authoritative) ───────────────────────
// GET recipes (enriched with display metadata) + POST craft. Crafting consumes
// harvested resources (resource_inventory) and stackable material consumables
// (player_inventory) and grants an output item. Utility goods (batteries/fuel)
// are never producible — guarded in the catalog and again at grant time.
router.get("/items/recipes", (_req, res) => {
  const recipes = CRAFT_RECIPES.map((r) => {
    const outItem = findCatalogItem(r.output.itemId);
    return {
      id: r.id,
      name: r.name,
      blurb: r.blurb,
      icon: r.icon,
      category: r.category,
      inputs: r.inputs.map((inp) => {
        const meta = inp.kind === "resource" ? getResourceDef(inp.id) : findCatalogItem(inp.id);
        return {
          kind: inp.kind,
          id: inp.id,
          qty: inp.qty,
          name: meta?.name ?? inp.id,
          icon: (meta as any)?.icon ?? "📦",
        };
      }),
      output: {
        itemId: r.output.itemId,
        qty: r.output.qty,
        name: outItem?.name ?? r.output.itemId,
        icon: (outItem as any)?.icon ?? "📦",
        type: outItem?.type ?? "",
        stackable: outItem ? isConsumable(outItem) : false,
      },
    };
  });
  res.json({ recipes });
});

router.post("/items/craft", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const recipe = getCraftRecipe(String(req.body?.recipeId ?? ""));
  if (!recipe) { res.status(400).json({ error: "Unknown recipe" }); return; }

  const outItem = findCatalogItem(recipe.output.itemId);
  if (!outItem) { res.status(500).json({ error: "Recipe output is invalid" }); return; }
  // Defense-in-depth: never let crafting mint a Pablo-monopoly utility good.
  if (isUtilityOutput(recipe.output.itemId)) {
    res.status(403).json({ error: "That item is utility-monopoly and can't be crafted." });
    return;
  }
  const outStackable = isConsumable(outItem);

  try {
    const result = await db.transaction(async (tx) => {
      // Decrement every input atomically. resource inputs hit resource_inventory;
      // item inputs hit the stackable consumable helper. Any shortfall throws so
      // the whole transaction rolls back — crafting is all-or-nothing.
      const capacity = await checkCarriedCapacity(tx, userId, slot, recipe.output.itemId);
      if (!capacity.ok) {
        return { status: 409 as const, body: { error: "Inventory full. Store an item in your home locker first.", ...capacity } };
      }
      for (const inp of recipe.inputs) {
        if (inp.kind === "resource") {
          const dec = await tx.update(resourceInventoryTable)
            .set({ quantity: sql`${resourceInventoryTable.quantity} - ${inp.qty}` })
            .where(and(
              eq(resourceInventoryTable.userId, userId),
              eq(resourceInventoryTable.resourceId, inp.id),
              sql`${resourceInventoryTable.quantity} >= ${inp.qty}`,
            ))
            .returning({ id: resourceInventoryTable.id, quantity: resourceInventoryTable.quantity });
          if (dec.length === 0) return { status: 409 as const, body: { error: "Missing materials", recipeId: recipe.id } };
          if (dec[0].quantity <= 0) {
            await tx.delete(resourceInventoryTable).where(eq(resourceInventoryTable.id, dec[0].id));
          }
        } else {
          const ok = await removeConsumable(tx, userId, slot, inp.id, inp.qty);
          if (!ok) return { status: 409 as const, body: { error: "Missing materials", recipeId: recipe.id } };
        }
      }

      // Grant the output. Stackable consumables add to the stack; boolean-owned
      // gear inserts once (reject if already owned so inputs aren't wasted).
      if (outStackable) {
        await addConsumable(tx, userId, slot, recipe.output.itemId, recipe.output.qty, "crafted");
      } else {
        const inserted = await tx.insert(playerInventoryTable)
          .values({ userId, slotIndex: slot, itemId: recipe.output.itemId, quantity: 1, acquiredVia: "crafted" })
          .onConflictDoNothing()
          .returning({ id: playerInventoryTable.id });
        if (inserted.length === 0) {
          return { status: 409 as const, body: { error: "You already own that item." } };
        }
      }

      return { status: 200 as const, body: { ok: true, recipeId: recipe.id, output: { itemId: recipe.output.itemId, qty: outStackable ? recipe.output.qty : 1, name: outItem.name, icon: (outItem as any).icon ?? "📦" } } };
    });

    res.status(result.status).json(result.body);
  } catch (e: any) {
    console.error("[Items] craft failed:", e?.message);
    res.status(500).json({ error: "Failed to craft item" });
  }
});

// ─── Install targets (server-authoritative ownership) ────────────────────────
interface ResolvedTarget {
  targetType: InstallTargetType;
  targetId: string;
  label: string;
  capacity: number;
}

// Resolve every target this character actually owns that can hold a consumable:
// homes (story home base + property deeds), vehicles (owned catalog vehicles),
// bots (owned bots), and companions (active dog/cat). This is THE ownership
// check — install validates against this set so a client can never install into
// something it doesn't own.
async function resolveInstallTargets(userId: string, slot: number): Promise<ResolvedTarget[]> {
  const targets: ResolvedTarget[] = [];

  const [saveRow] = await db
    .select({ data: salarymanSavesTable.data })
    .from(salarymanSavesTable)
    .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
    .limit(1);
  const data = (saveRow?.data ?? {}) as Record<string, any>;

  // Homes: the story home base (if any) + every property deed.
  const homeBase = data?.story?.homeBase as { label?: string } | undefined;
  if (homeBase && typeof homeBase.label === "string") {
    targets.push({ targetType: "home", targetId: "home_base", label: homeBase.label || "Home", capacity: INSTALL_CAPACITY.home });
  }
  const deeds = Array.isArray(data?.propertyDeeds) ? (data.propertyDeeds as Array<{ id?: unknown; name?: unknown }>) : [];
  for (const d of deeds) {
    if (typeof d?.id === "string" && d.id) {
      targets.push({ targetType: "home", targetId: d.id, label: typeof d.name === "string" ? d.name : d.id, capacity: INSTALL_CAPACITY.home });
    }
  }

  // Companions: active dog / cat.
  const dc = data?.dogCompanion as { active?: boolean; name?: unknown } | undefined;
  if (dc?.active === true && typeof dc.name === "string" && dc.name.trim()) {
    targets.push({ targetType: "companion", targetId: dc.name.trim().toUpperCase(), label: dc.name.trim(), capacity: INSTALL_CAPACITY.companion });
  }
  const cc = data?.catCompanion as { active?: boolean; name?: unknown } | undefined;
  if (cc?.active === true && typeof cc.name === "string" && cc.name.trim()) {
    targets.push({ targetType: "companion", targetId: cc.name.trim().toUpperCase(), label: cc.name.trim(), capacity: INSTALL_CAPACITY.companion });
  }

  // Vehicles: owned catalog items of type "vehicle".
  const invRows = await db
    .select({ itemId: playerInventoryTable.itemId })
    .from(playerInventoryTable)
    .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slot)));
  for (const r of invRows) {
    const ci = findCatalogItem(r.itemId);
    if (ci?.type === "vehicle") {
      targets.push({ targetType: "vehicle", targetId: ci.id, label: ci.name, capacity: INSTALL_CAPACITY.vehicle });
    }
  }

  // Bots: owned bots.
  const bots = await db
    .select({ id: botsTable.id, name: botsTable.name })
    .from(botsTable)
    .where(eq(botsTable.ownerId, userId));
  for (const b of bots) {
    targets.push({ targetType: "bot", targetId: String(b.id), label: b.name, capacity: INSTALL_CAPACITY.bot });
  }

  // Assistant: every player has exactly one Pablo/Mila AI assistant. It runs on
  // a battery just like the rest — installing a cell here powers AI usage.
  targets.push({ targetType: "assistant", targetId: ASSISTANT_TARGET_ID, label: "Pablo / Mila Assistant", capacity: INSTALL_CAPACITY.assistant });

  return targets;
}

router.get("/items/install-targets", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const targets = await resolveInstallTargets(userId, slot);
    res.json({ slot, targets });
  } catch (e: any) {
    console.error("[Items] install-targets failed:", e?.message);
    res.status(500).json({ error: "Failed to load install targets" });
  }
});

// List everything currently installed for this character save.
router.get("/items/installed", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const rows = await db
      .select()
      .from(playerInstalledItemsTable)
      .where(and(eq(playerInstalledItemsTable.userId, userId), eq(playerInstalledItemsTable.slotIndex, slot)));
    res.json({ slot, rows });
  } catch (e: any) {
    console.error("[Items] installed list failed:", e?.message);
    res.status(500).json({ error: "Failed to load installed items" });
  }
});

// Install a held consumable into a target the player owns. Consumes one from the
// stack and records it against (targetType, targetId, slotNo) atomically.
router.post("/items/install", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  const targetType = String(req.body?.targetType ?? "") as InstallTargetType;
  const targetId = String(req.body?.targetId ?? "");
  if (!INSTALL_TARGET_TYPES.includes(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid install target" });
    return;
  }
  if (!canInstallInto(item, targetType)) {
    res.status(400).json({ error: `${item.name} can't be installed into a ${targetType}.` });
    return;
  }

  try {
    // Authoritative ownership check: the target must be in the resolved set.
    const targets = await resolveInstallTargets(userId, slot);
    const target = targets.find((t) => t.targetType === targetType && t.targetId === targetId);
    if (!target) { res.status(404).json({ error: "You don't own that target." }); return; }

    const result = await db.transaction(async (tx) => {
      // Capacity check: count what's already installed on this target.
      const installed = await tx
        .select({ slotNo: playerInstalledItemsTable.slotNo })
        .from(playerInstalledItemsTable)
        .where(and(
          eq(playerInstalledItemsTable.userId, userId),
          eq(playerInstalledItemsTable.slotIndex, slot),
          eq(playerInstalledItemsTable.targetType, targetType),
          eq(playerInstalledItemsTable.targetId, targetId),
        ));
      if (installed.length >= target.capacity) return { error: "full" as const };
      // Find the lowest free physical slot (0..capacity-1).
      const used = new Set(installed.map((r) => r.slotNo));
      let slotNo = 0;
      while (slotNo < target.capacity && used.has(slotNo)) slotNo++;

      // Take one from the stack — fails if the player no longer holds any.
      const took = await removeConsumable(tx, userId, slot, item.id, 1);
      if (!took) return { error: "none_held" as const };

      // A freshly installed battery comes full — the player paid for it on buy.
      const cap = batteryCapacity(item.id);
      await tx.insert(playerInstalledItemsTable).values({
        userId, slotIndex: slot, targetType, targetId, slotNo, itemId: item.id,
        currentCharge: cap > 0 ? cap : null,
      });
      return { ok: true as const, slotNo };
    });

    if ("error" in result) {
      if (result.error === "full") { res.status(409).json({ error: `That ${targetType} has no free slots.` }); return; }
      res.status(409).json({ error: "You don't have that consumable to install." });
      return;
    }
    res.json({ ok: true, installed: item.id, targetType, targetId, slotNo: result.slotNo });
  } catch (e: any) {
    console.error("[Items] install failed:", e?.message);
    res.status(500).json({ error: "Failed to install item" });
  }
});

// Remove an installed consumable, returning one to the player's stack.
router.post("/items/uninstall", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const targetType = String(req.body?.targetType ?? "") as InstallTargetType;
  const targetId = String(req.body?.targetId ?? "");
  if (!INSTALL_TARGET_TYPES.includes(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid install target" });
    return;
  }
  const slotNo = Math.max(0, Math.floor(Number(req.body?.slotNo ?? 0)) || 0);
  try {
    const result = await db.transaction(async (tx) => {
      const [installed] = await tx.select().from(playerInstalledItemsTable)
        .where(and(
          eq(playerInstalledItemsTable.userId, userId),
          eq(playerInstalledItemsTable.slotIndex, slot),
          eq(playerInstalledItemsTable.targetType, targetType),
          eq(playerInstalledItemsTable.targetId, targetId),
          eq(playerInstalledItemsTable.slotNo, slotNo),
        ))
        .for("update").limit(1);
      if (!installed) return { error: "not_installed" as const };
      const cap = batteryCapacity(installed.itemId);
      const willReturn = cap === 0 || Math.round(Number(installed.currentCharge ?? 0)) >= cap;
      if (willReturn) {
        const capacity = await checkCarriedCapacity(tx, userId, slot, installed.itemId);
        if (!capacity.ok) return { error: "full" as const, capacity };
      }
      const removed = await tx
        .delete(playerInstalledItemsTable)
        .where(and(
          eq(playerInstalledItemsTable.userId, userId),
          eq(playerInstalledItemsTable.slotIndex, slot),
          eq(playerInstalledItemsTable.targetType, targetType),
          eq(playerInstalledItemsTable.targetId, targetId),
          eq(playerInstalledItemsTable.slotNo, slotNo),
        ))
        .returning({ itemId: playerInstalledItemsTable.itemId, currentCharge: playerInstalledItemsTable.currentCharge });
      if (removed.length === 0) return { error: "not_installed" as const };
      const itemId = removed[0].itemId;
      // Batteries only return to the stack if FULL. A partially-drained cell is
      // discarded on uninstall — otherwise a player could dodge recharge costs
      // by pulling a near-empty battery and re-buying/swapping a fresh one for
      // free. Non-battery installs (gear modules etc.) always return.
      let returned = true;
      if (cap > 0) {
        returned = Math.round(Number(removed[0].currentCharge ?? 0)) >= cap;
      }
      if (returned) await addConsumable(tx, userId, slot, itemId, 1, "grant");
      return { ok: true as const, itemId, returned };
    });
    if ("error" in result) {
      if (result.error === "full") {
        res.status(409).json({ error: "Inventory full. Store an item in your home locker first.", ...result.capacity });
        return;
      }
      res.status(404).json({ error: "Nothing installed in that slot." });
      return;
    }
    res.json({ ok: true, uninstalled: result.itemId, returned: result.returned, targetType, targetId, slotNo });
  } catch (e: any) {
    console.error("[Items] uninstall failed:", e?.message);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

// ─── Battery charge management ────────────────────────────────────────────────
// Batteries are the in-world wrapper for AI/electrical running cost. These routes
// let a player inspect charge, top a battery back up at the utility rate, swap a
// drained cell for a fresh held one, and sell a held cell back for a partial
// refund. Owners are exempt from all charges.

// GET /items/battery/status — every installed battery (across all targets) for a
// save slot, with charge/capacity, plus the player's held battery stacks and the
// electricity rate. The client groups by target and surfaces low-power warnings.
router.get("/items/battery/status", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    const installedRows = await db
      .select()
      .from(playerInstalledItemsTable)
      .where(and(eq(playerInstalledItemsTable.userId, userId), eq(playerInstalledItemsTable.slotIndex, slot)));
    const installed = installedRows
      .filter((r) => isBattery(r.itemId))
      .map((r) => {
        const capacity = batteryCapacity(r.itemId);
        const charge = Math.max(0, Math.min(capacity, Math.round(Number(r.currentCharge ?? capacity))));
        return {
          targetType: r.targetType,
          targetId: r.targetId,
          slotNo: r.slotNo,
          itemId: r.itemId,
          capacity,
          charge,
          pct: capacity > 0 ? charge / capacity : 0,
          rechargeCost: fiatCostForChargeUnits(capacity - charge),
        };
      });

    const invRows = await db
      .select({ itemId: playerInventoryTable.itemId, quantity: playerInventoryTable.quantity })
      .from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slot)));
    const held = invRows
      .filter((r) => isBattery(r.itemId))
      .map((r) => {
        const spec = findBatterySpec(r.itemId)!;
        return { itemId: r.itemId, quantity: r.quantity, capacity: spec.capacity, sellRefund: Math.floor(spec.priceFiat * SELL_REFUND_PCT) };
      });

    res.json({ slot, electricityRateFiatPerUnit: ELECTRICITY_RATE_FIAT_PER_UNIT, installed, held });
  } catch (e: any) {
    console.error("[Items] battery status failed:", e?.message);
    res.status(500).json({ error: "Failed to load battery status" });
  }
});

// POST /items/battery/recharge — top a specific installed battery back to full at
// the electricity rate. Owners recharge free. The sale books to the utility
// monopoly's electricity revenue ledger.
router.post("/items/battery/recharge", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const targetType = String(req.body?.targetType ?? "") as InstallTargetType;
  const targetId = String(req.body?.targetId ?? "");
  const slotNo = Math.max(0, Math.floor(Number(req.body?.slotNo ?? 0)) || 0);
  if (!INSTALL_TARGET_TYPES.includes(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid battery target" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(playerInstalledItemsTable)
      .where(and(
        eq(playerInstalledItemsTable.userId, userId),
        eq(playerInstalledItemsTable.slotIndex, slot),
        eq(playerInstalledItemsTable.targetType, targetType),
        eq(playerInstalledItemsTable.targetId, targetId),
        eq(playerInstalledItemsTable.slotNo, slotNo),
      ))
      .limit(1);
    if (!row || !isBattery(row.itemId)) { res.status(404).json({ error: "No battery in that slot." }); return; }
    const capacity = batteryCapacity(row.itemId);
    const charge = Math.max(0, Math.min(capacity, Math.round(Number(row.currentCharge ?? capacity))));
    const missing = capacity - charge;
    if (missing <= 0) { res.json({ ok: true, alreadyFull: true, charge: capacity, capacity }); return; }

    const cost = fiatCostForChargeUnits(missing);
    const email = (req as any).user?.email as string | undefined;
    const owner = isOwnerEmail(email);

    if (!owner) {
      const paid = await spendEarnedFiat({ userId, amountFiat: cost, description: `Pablo Power: recharge ${findBatterySpec(row.itemId)?.name ?? "battery"}` });
      if (!paid.ok) { res.status(402).json({ error: "insufficient_fiat", required: cost, spendable: paid.spendable }); return; }
    }

    try {
      await db.update(playerInstalledItemsTable)
        .set({ currentCharge: capacity })
        .where(eq(playerInstalledItemsTable.id, row.id));
    } catch (err: any) {
      if (!owner) await refundFiat(userId, cost);
      console.error("[Items] recharge write failed, refunded ƒ:", err?.message);
      res.status(500).json({ error: "Recharge failed — your florins were refunded." });
      return;
    }
    if (!owner) {
      void recordUtilityRevenue({ userId, kind: "electricity", itemId: row.itemId, units: missing, amountFiat: cost, description: `Recharge ${findBatterySpec(row.itemId)?.name ?? row.itemId}` });
    }
    res.json({ ok: true, charged: missing, cost: owner ? 0 : cost, charge: capacity, capacity });
  } catch (e: any) {
    console.error("[Items] recharge failed:", e?.message);
    res.status(500).json({ error: "Failed to recharge" });
  }
});

// POST /items/battery/swap — pull whatever battery sits in an installed slot
// (DISCARDED, no refund — a drained cell is spent) and drop in a fresh held one
// at full charge. The held battery must be one the player owns in stock.
router.post("/items/battery/swap", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const targetType = String(req.body?.targetType ?? "") as InstallTargetType;
  const targetId = String(req.body?.targetId ?? "");
  const slotNo = Math.max(0, Math.floor(Number(req.body?.slotNo ?? 0)) || 0);
  const newItem = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!INSTALL_TARGET_TYPES.includes(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid battery target" });
    return;
  }
  if (!newItem || !isBattery(newItem.id)) { res.status(400).json({ error: "That item isn't a battery." }); return; }
  if (!canInstallInto(newItem, targetType)) {
    res.status(400).json({ error: `${newItem.name} can't be installed into a ${targetType}.` });
    return;
  }
  try {
    // Ownership of the target is authoritative.
    const targets = await resolveInstallTargets(userId, slot);
    const target = targets.find((t) => t.targetType === targetType && t.targetId === targetId);
    if (!target) { res.status(404).json({ error: "You don't own that target." }); return; }

    const result = await db.transaction(async (tx) => {
      // Take the fresh battery from the stack first — bail if none held.
      const took = await removeConsumable(tx, userId, slot, newItem.id, 1);
      if (!took) return { error: "none_held" as const };
      // Discard the old cell in that slot (if any) — no refund.
      await tx.delete(playerInstalledItemsTable)
        .where(and(
          eq(playerInstalledItemsTable.userId, userId),
          eq(playerInstalledItemsTable.slotIndex, slot),
          eq(playerInstalledItemsTable.targetType, targetType),
          eq(playerInstalledItemsTable.targetId, targetId),
          eq(playerInstalledItemsTable.slotNo, slotNo),
        ));
      const cap = batteryCapacity(newItem.id);
      await tx.insert(playerInstalledItemsTable).values({
        userId, slotIndex: slot, targetType, targetId, slotNo, itemId: newItem.id, currentCharge: cap,
      });
      return { ok: true as const };
    });
    if ("error" in result) { res.status(409).json({ error: "You don't have that battery to swap in." }); return; }
    res.json({ ok: true, installed: newItem.id, targetType, targetId, slotNo });
  } catch (e: any) {
    console.error("[Items] battery swap failed:", e?.message);
    res.status(500).json({ error: "Failed to swap battery" });
  }
});

// POST /items/battery/sell — sell a HELD battery back to the utility for a
// partial refund. Held stacks are always full (drained cells are discarded on
// uninstall), so the refund is a flat fraction of the purchase price.
router.post("/items/battery/sell", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item || !isBattery(item.id)) { res.status(400).json({ error: "That item isn't a battery." }); return; }
  const spec = findBatterySpec(item.id)!;
  const refund = Math.floor(spec.priceFiat * SELL_REFUND_PCT);
  try {
    const sold = await db.transaction(async (tx) => removeConsumable(tx, userId, slot, item.id, 1));
    if (!sold) { res.status(409).json({ error: "You don't hold that battery." }); return; }
    await refundFiat(userId, refund);
    res.json({ ok: true, sold: item.id, refund });
  } catch (e: any) {
    console.error("[Items] battery sell failed:", e?.message);
    res.status(500).json({ error: "Failed to sell battery" });
  }
});

export default router;
