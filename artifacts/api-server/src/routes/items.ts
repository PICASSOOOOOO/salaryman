import { Router, type IRouter, type Request } from "express";
import {
  db,
  playerInventoryTable,
  playerLoadoutTable,
  playerStorageTable,
  bankAccountsTable,
  salarymanSavesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { getStripe } from "./stripe";
import { isOwnerEmail } from "../lib/plan";
import { spendEarnedFiat } from "../lib/pablo-tax";
import {
  ITEM_CATALOG,
  ITEM_TYPES,
  findCatalogItem,
  computeGearStats,
  type EquipSlotMap,
} from "../lib/item-catalog";

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

export default router;
