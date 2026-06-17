import { Router, type IRouter, type Request } from "express";
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
import {
  ITEM_CATALOG,
  ITEM_TYPES,
  findCatalogItem,
  computeGearStats,
  isConsumable,
  canInstallInto,
  type EquipSlotMap,
} from "../lib/item-catalog";
import { utilityKindForItem } from "../lib/utility-catalog";
import { recordUtilityRevenue } from "../lib/utility-revenue";
import { CRAFT_RECIPES, getCraftRecipe, isUtilityOutput } from "../lib/crafting-catalog";
import { getResourceDef } from "../lib/resource-catalog";

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
router.get("/items/catalog", (_req, res) => {
  res.json({ types: ITEM_TYPES, items: ITEM_CATALOG });
});

// ─── Inventory for a character save slot ──────────────────────────────────────
router.get("/items/inventory", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.query.slot);
  try {
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
    res.json({ slot, loadout: map, stats: computeGearStats(equippedIds) });
  } catch {
    res.status(500).json({ error: "Failed to load loadout" });
  }
});

// ─── Buy with in-game FIAT ────────────────────────────────────────────────────
router.post("/items/buy", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) {
    res.status(400).json({ error: "Unknown item" });
    return;
  }

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

    const totalPrice = item.priceFiat * qty;
    const paid = await spendEarnedFiat({
      userId,
      amountFiat: totalPrice,
      description: `Armory: ${item.name} ×${qty}`,
    });
    if (!paid.ok) {
      res.status(402).json({ error: "insufficient_fiat", required: totalPrice, spendable: paid.spendable });
      return;
    }
    try {
      await db.transaction((tx) => addConsumable(tx, userId, slot, item.id, qty, "fiat"));
    } catch (err: any) {
      await refundFiat(userId, totalPrice);
      console.error("[Items] consumable buy failed, refunded ƒ:", err?.message);
      res.status(500).json({ error: "Purchase failed — your florins were refunded." });
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
  let effectivePrice = item.priceFiat;
  try {
    const [saveRow] = await db
      .select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slot)))
      .limit(1);
    const skills = (saveRow?.data as any)?.skills as string[] | undefined;
    if (Array.isArray(skills)) {
      if (skills.includes("business.negotiator_2")) {
        effectivePrice = Math.floor(item.priceFiat * 0.90);
      } else if (skills.includes("business.negotiator_1")) {
        effectivePrice = Math.floor(item.priceFiat * 0.95);
      }
    }
  } catch { /* best-effort — fall back to full price */ }

  const paid = await spendEarnedFiat({
    userId,
    amountFiat: effectivePrice,
    description: `Armory: ${item.name}`,
  });
  if (!paid.ok) {
    res.status(402).json({ error: "insufficient_fiat", required: effectivePrice, spendable: paid.spendable });
    return;
  }

  let inserted: { id: number }[];
  try {
    inserted = await db.insert(playerInventoryTable)
      .values({ userId, slotIndex: slot, itemId: item.id, acquiredVia: "fiat" })
      .onConflictDoNothing()
      .returning({ id: playerInventoryTable.id });
  } catch (err: any) {
    // Charged but grant errored — refund the FIAT (the spend/grant pair isn't a
    // single transaction, so this is the compensating leg).
    await refundFiat(userId, effectivePrice);
    console.error("[Items] buy grant failed, refunded ƒ:", err?.message);
    res.status(500).json({ error: "Purchase failed — your florins were refunded." });
    return;
  }
  // A concurrent purchase (double-click / retry) can win the race and grant the
  // item first; our insert then no-ops via onConflictDoNothing. We've already
  // debited FIAT for it, so refund the duplicate charge instead of charging twice.
  if (inserted.length === 0) {
    await refundFiat(userId, effectivePrice);
    res.json({ owned: true, alreadyOwned: true });
    return;
  }
  res.json({ owned: true, fiat: effectivePrice, newBalance: paid.newBalance });
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
// Decrements a held consumable by `qty` without any gameplay effect — the
// battery/gas/crafting loops that give consumption meaning are downstream tasks.
// This is just the inventory-side primitive they'll call.
router.post("/items/consume", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const slot = parseSlot(req.body?.slot);
  const item = findCatalogItem(String(req.body?.itemId ?? ""));
  if (!item) { res.status(400).json({ error: "Unknown item" }); return; }
  if (!isConsumable(item)) { res.status(400).json({ error: "That item isn't a consumable." }); return; }
  const qtyRaw = Number(req.body?.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(99, Math.floor(qtyRaw))) : 1;
  try {
    const ok = await db.transaction((tx) => removeConsumable(tx, userId, slot, item.id, qty));
    if (!ok) { res.status(409).json({ error: "You don't have enough of that." }); return; }
    res.json({ ok: true, consumed: item.id, qty });
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

      await tx.insert(playerInstalledItemsTable).values({
        userId, slotIndex: slot, targetType, targetId, slotNo, itemId: item.id,
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
        .returning({ itemId: playerInstalledItemsTable.itemId });
      if (removed.length === 0) return { error: "not_installed" as const };
      await addConsumable(tx, userId, slot, removed[0].itemId, 1, "grant");
      return { ok: true as const, itemId: removed[0].itemId };
    });
    if ("error" in result) { res.status(404).json({ error: "Nothing installed in that slot." }); return; }
    res.json({ ok: true, uninstalled: result.itemId, targetType, targetId, slotNo });
  } catch (e: any) {
    console.error("[Items] uninstall failed:", e?.message);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

export default router;
