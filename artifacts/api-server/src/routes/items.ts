import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import {
  db,
  playerInventoryTable,
  playerLoadoutTable,
  playerStorageTable,
  playerInstalledItemsTable,
  resourceInventoryTable,
  bankAccountsTable,
  salarymanSavesTable,
  botsTable,
  INSTALL_TARGET_TYPES,
  INSTALL_CAPACITY,
  type InstallTargetType,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getStripe } from "./stripe";
import { isOwnerEmail } from "../lib/plan";
import { spendEarnedFiat } from "../lib/pablo-tax";
import { spendFiat } from "../lib/fiat-wallet";
import { recordLegacyRecoveryEventTx, restoreLegacyRecoveryForUser } from "../lib/legacy-recovery";
import {
  ITEM_CATALOG,
  ITEM_TYPES,
  findCatalogItem,
  computeGearStats,
  PUBLIC_VENDING_ITEM_IDS,
  requiresPhysicalBlackMarket,
  isConsumable,
  canInstallInto,
  type EquipSlotMap,
} from "../lib/item-catalog";
import { utilityKindForItem, findBatterySpec, ELECTRICITY_RATE_FIAT_PER_UNIT } from "../lib/utility-catalog";
import { recordUtilityRevenue } from "../lib/utility-revenue";
import { CRAFT_RECIPES, getCraftRecipe, isUtilityOutput } from "../lib/crafting-catalog";
import { getResourceDef } from "../lib/resource-catalog";
import { getMarketIndex } from "./real-estate";
import {
  isBattery,
  batteryCapacity,
  getInstalledBatteries,
  fiatCostForChargeUnits,
  SELL_REFUND_PCT,
  ASSISTANT_TARGET_ID,
} from "../lib/battery";

const router: IRouter = Router();

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
  const allowed = new Set<string>(PUBLIC_VENDING_ITEM_IDS);
  const catalog = await marketCatalogItems();
  res.json({ market: catalog.market, items: catalog.items.filter((item) => allowed.has(item.id)) });
});

// ─── Inventory for a character save slot ──────────────────────────────────────
router.get("/items/inventory", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
    await restoreLegacyRecoveryForUser(userId, (req as any).user?.email);
    const rows = await db
      .select()
      .from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slot)));
    res.json({ slot, itemIds: rows.map((r) => r.itemId), rows });
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
router.post("/items/buy", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  await restoreLegacyRecoveryForUser(userId, (req as any).user?.email);
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) {
    res.status(400).json({ error: "Unknown item" });
    return;
  }
  const source = String(req.body?.source ?? "");
  if (requiresPhysicalBlackMarket(item) && source !== "black_market") {
    res.status(403).json({ error: "Find the physical black-market dealer in Shadow Tower." });
    return;
  }
  if (source === "tower_vending" && !PUBLIC_VENDING_ITEM_IDS.includes(item.id as typeof PUBLIC_VENDING_ITEM_IDS[number])) {
    res.status(403).json({ error: "This item is not stocked in the Tower vending machine." });
    return;
  }
  const market = await getMarketIndex();
  const marketPriceFiat = Math.max(1, Math.round(item.priceFiat * market.multiplier));

  // ─── Consumable branch: stack a quantity instead of one-time ownership ─────
  if (isConsumable(item)) {
    const qtyRaw = Number(req.body?.qty ?? 1);
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(99, Math.floor(qtyRaw))) : 1;
    const email = (req as any).user?.email as string | undefined;

    // Owners get consumables granted free.
    if (isOwnerEmail(email)) {
      await db.transaction((tx) => addConsumable(tx, userId, slot, item.id, qty, "grant"));
      res.json({ owned: true, granted: true, quantity: qty });
      return;
    }

    const totalPrice = marketPriceFiat * qty;
    try {
      const paid = await db.transaction(async (tx) => {
        const result = await spendFiat(tx, {
          userId,
          amountFiat: totalPrice,
          description: `Armory: ${item.name} ×${qty}`,
          kind: "item_purchase",
        });
        if (!result.ok) return result;
        await addConsumable(tx, userId, slot, item.id, qty, "fiat");
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
        return result;
      });
      if (!paid.ok) {
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
  if (existing.length > 0) {
    res.json({ owned: true, alreadyOwned: true });
    return;
  }

  // Owners get everything granted free.
  const email = (req as any).user?.email as string | undefined;
  if (isOwnerEmail(email)) {
    await db.insert(playerInventoryTable)
      .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: "grant" })
      .onConflictDoNothing();
    res.json({ owned: true, granted: true });
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
      const result = await spendFiat(tx, {
        userId,
        amountFiat: effectivePrice,
        description: `Armory: ${item.name}`,
        kind: "item_purchase",
      });
      if (!result.ok) return result;
      const inserted = await tx
        .insert(playerInventoryTable)
        .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: "fiat" })
        .onConflictDoNothing()
        .returning({ id: playerInventoryTable.id });
      if (inserted.length === 0) throw new Error("ITEM_ALREADY_OWNED");
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
      return result;
    });
    if (!paid.ok) {
      res.status(402).json({ error: "insufficient_fiat", required: effectivePrice, spendable: paid.spendable });
      return;
    }
    res.json({ owned: true, fiat: effectivePrice, newBalance: paid.newBalance });
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

// ─── Buy premium high-tech with REAL money (Stripe) ──────────────────────────
router.post("/items/checkout", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) {
    res.status(400).json({ error: "Unknown item" });
    return;
  }
  if (item.priceUsd == null) {
    res.status(400).json({ error: "This item is FIAT-only — buy it with ƒ." });
    return;
  }

  // Already owned? Don't sell it twice.
  const existing = await db
    .select({ id: playerInventoryTable.id })
    .from(playerInventoryTable)
    .where(and(
      eq(playerInventoryTable.userId, userId),
      eq(playerInventoryTable.slotIndex, slot),
      eq(playerInventoryTable.itemId, item.id),
    ))
    .limit(1);
  if (existing.length > 0) {
    res.json({ owned: true, alreadyOwned: true });
    return;
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).json({ error: "Card checkout is not configured yet" });
    return;
  }
  const baseUrl = getAppBaseUrl();

  // Double-click / retry safety: keying the create call by (userId, slot, itemId)
  // makes Stripe return the SAME in-flight session for a repeat request instead of
  // opening a second checkout that could charge the card twice. Stripe scopes
  // idempotency to a 24h window, which comfortably covers a single buy attempt.
  const idempotencyKey = `item-checkout:${userId}:${slot}:${item.id}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${item.name} — SALARYMAN Armory`,
              description: item.blurb,
            },
            unit_amount: item.priceUsd * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/armory?purchase=success&item=${item.id}`,
      cancel_url: `${baseUrl}/armory?purchase=cancel`,
      client_reference_id: userId,
      metadata: {
        userId,
        type: "item",
        itemId: item.id,
        slotIndex: String(slot),
        brand: "Picassoo.AI",
        product_line: "SALARYMAN",
      },
      payment_intent_data: {
        description: `${item.name} by Picassoo.AI — SALARYMAN`,
      },
    },
    { idempotencyKey },
  );

  res.json({ url: session.url });
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
    if ("error" in result) { res.status(404).json({ error: "That item isn't in your locker." }); return; }
    res.json({ ok: true, withdrawn: item.id });
  } catch (e: any) {
    console.error("[Items] withdraw failed:", e?.message);
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
      const cap = batteryCapacity(itemId);
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
    if ("error" in result) { res.status(404).json({ error: "Nothing installed in that slot." }); return; }
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
