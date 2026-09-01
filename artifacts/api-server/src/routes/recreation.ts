import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, playerInventoryTable, salarymanSavesTable } from "@workspace/db";
import { getRecreationPlan, type ShadowTowerCity } from "@workspace/api-zod/shadow-tower";
import { creditFiat, getSpendableFiat, spendFiat } from "../lib/fiat-wallet";
import {
  REC_GAMES, REC_ITEMS, REC_SPONSORS, findRecItem, isRecGameId,
  normalizeRecState, settleRecGame, type RecState,
} from "../lib/recreation";

const router = Router();
function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user.id;
}
function slotOf(value: unknown) {
  const slot = Number(value ?? 0);
  return Number.isInteger(slot) && slot >= 0 && slot <= 64 ? slot : null;
}
function validRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockedSave(tx: Tx, userId: string, slotIndex: number) {
  return (await tx.select().from(salarymanSavesTable)
    .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, slotIndex)))
    .for("update").limit(1))[0];
}
function withRec(data: Record<string, unknown>, rec: RecState) { return { ...data, rec }; }
async function saveRec(tx: Tx, save: NonNullable<Awaited<ReturnType<typeof lockedSave>>>, rec: RecState) {
  await tx.update(salarymanSavesTable).set({ data: withRec(save.data, rec), lastSavedAt: new Date() })
    .where(eq(salarymanSavesTable.id, save.id));
}

router.get("/shadow-tower/recreation", (req, res) => {
  if (!requireAuth(req, res)) return;
  const city = req.query.city === "huda_city" ? "huda_city" : "minx_city";
  res.json({
    floor: { id: "public-rec", city, floorNumber: 1, classification: "public", tenure: "system", archetype: "recreation" },
    plan: getRecreationPlan(city as ShadowTowerCity), assignments: [], botGroups: [],
  });
});

router.get("/recreation/state", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.query.slot);
  if (!userId || slotIndex == null) return;
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex);
    if (!save) return null;
    const rec = normalizeRecState(save.data.rec);
    await saveRec(tx, save, rec);
    const inventory = await tx.select().from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slotIndex)));
    return { rec, inventory: inventory.filter((row) => row.itemId.startsWith("rec-")) };
  });
  if (!result) { res.status(409).json({ error: "Create a character before visiting REC" }); return; }
  const wallet = await getSpendableFiat(userId);
  res.json({ ...result, wallet, games: REC_GAMES, items: REC_ITEMS, sponsors: REC_SPONSORS });
});

router.post("/recreation/games/start", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  if (!userId || slotIndex == null || !isRecGameId(req.body?.gameId) || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid slot, game and requestId required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return null;
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { rec, duplicate: true };
    const sponsor = REC_SPONSORS[new Date().getUTCDate() % REC_SPONSORS.length];
    rec.activeSession = { id: randomUUID(), gameId: req.body.gameId, sponsorId: sponsor.id, startedAt: new Date().toISOString() };
    rec.processed = [...rec.processed, req.body.requestId].slice(-80);
    await saveRec(tx, save, rec);
    return { rec, session: rec.activeSession, sponsor };
  });
  if (!result) { res.status(409).json({ error: "Create a character before visiting REC" }); return; }
  res.json(result);
});

router.post("/recreation/games/finish", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  if (!userId || slotIndex == null || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid slot and requestId required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return { type: "missing" as const };
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { type: "duplicate" as const, rec };
    if (!rec.activeSession || rec.activeSession.id !== req.body.sessionId) return { type: "session" as const };
    const settled = settleRecGame(rec, rec.activeSession, req.body.requestId);
    if (!settled.ok) return { type: "stamina" as const, required: REC_GAMES[rec.activeSession.gameId].staminaCost, rec };
    const credited = settled.rewardFiat > 0
      ? await creditFiat(tx, { userId, amountFiat: settled.rewardFiat, description: `REC ${rec.activeSession?.gameId ?? "game"} sponsor reward`, kind: "rec_reward", idempotencyKey: `rec:${req.body.requestId}` })
      : null;
    await saveRec(tx, save, rec);
    return { type: "ok" as const, rec, settled, wallet: credited };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before visiting REC" });
  else if (result.type === "session") res.status(409).json({ error: "No matching active game session" });
  else if (result.type === "stamina") res.status(409).json({ error: "insufficient_stamina", required: result.required, rec: result.rec });
  else res.json(result);
});

router.post("/recreation/bar/purchase", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  const item = findRecItem(String(req.body?.itemId ?? ""));
  if (!userId || slotIndex == null || !item || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid REC item, slot and requestId required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return { type: "missing" as const };
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { type: "ok" as const, rec, duplicate: true };
    const sponsor = REC_SPONSORS[new Date().getUTCDate() % REC_SPONSORS.length];
    const price = Math.max(1, Math.floor(item.price * (100 - sponsor.discountPct) / 100));
    const paid = await spendFiat(tx, { userId, amountFiat: price, description: `REC bar: ${item.name}`, kind: "rec_bar", idempotencyKey: `rec:${req.body.requestId}` });
    if (!paid.ok) return { type: "funds" as const, paid, price };
    await tx.insert(playerInventoryTable).values({ userId, slotIndex, itemId: item.id, quantity: 1, acquiredVia: "fiat" })
      .onConflictDoUpdate({ target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId], set: { quantity: sql`${playerInventoryTable.quantity} + 1` } });
    if ("maxCharges" in item) rec.charges[item.id] = item.maxCharges;
    rec.processed = [...rec.processed, req.body.requestId].slice(-80);
    await saveRec(tx, save, rec);
    return { type: "ok" as const, rec, paid, price, sponsor };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before visiting REC" });
  else if (result.type === "funds") res.status(402).json({ error: "insufficient_fiat", required: result.price, spendable: result.paid.spendable });
  else res.json(result);
});

router.post("/recreation/bar/consume", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  const item = findRecItem(String(req.body?.itemId ?? ""));
  if (!userId || slotIndex == null || !item || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid REC item, slot and requestId required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return { type: "missing" as const };
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { type: "ok" as const, rec, duplicate: true };
    const [owned] = await tx.select().from(playerInventoryTable).where(and(
      eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slotIndex), eq(playerInventoryTable.itemId, item.id),
    )).for("update").limit(1);
    if (!owned) return { type: "inventory" as const };
    if ("maxCharges" in item) {
      const charges = rec.charges[item.id] ?? 0;
      if (charges <= 0) return { type: "charge" as const };
      rec.charges[item.id] = charges - 1;
    } else if (owned.quantity <= 1) {
      await tx.delete(playerInventoryTable).where(eq(playerInventoryTable.id, owned.id));
    } else {
      await tx.update(playerInventoryTable).set({ quantity: owned.quantity - 1 }).where(eq(playerInventoryTable.id, owned.id));
    }
    rec.stamina = Math.min(100, rec.stamina + item.stamina);
    if (item.effect) {
      rec.effects = rec.effects.filter((effect) => effect.kind !== item.effect);
      rec.effects.push({ kind: item.effect, sourceItemId: item.id, expiresAt: new Date(Date.now() + item.durationSec * 1000).toISOString() });
    }
    rec.processed = [...rec.processed, req.body.requestId].slice(-80);
    await saveRec(tx, save, rec);
    return { type: "ok" as const, rec };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before visiting REC" });
  else if (result.type === "inventory") res.status(409).json({ error: "Item not owned" });
  else if (result.type === "charge") res.status(409).json({ error: "Recharge cell is empty" });
  else res.json(result);
});

router.post("/recreation/bar/recharge", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  const item = findRecItem(String(req.body?.itemId ?? ""));
  if (!userId || slotIndex == null || !item || !("maxCharges" in item) || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid rechargeable REC item required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return { type: "missing" as const };
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { type: "ok" as const, rec, duplicate: true };
    const [owned] = await tx.select({ id: playerInventoryTable.id }).from(playerInventoryTable).where(and(
      eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.slotIndex, slotIndex), eq(playerInventoryTable.itemId, item.id),
    )).limit(1);
    if (!owned) return { type: "inventory" as const };
    const paid = await spendFiat(tx, { userId, amountFiat: 500, description: `REC recharge: ${item.name}`, kind: "rec_recharge", idempotencyKey: `rec:${req.body.requestId}` });
    if (!paid.ok) return { type: "funds" as const, paid };
    rec.charges[item.id] = item.maxCharges;
    rec.processed = [...rec.processed, req.body.requestId].slice(-80);
    await saveRec(tx, save, rec);
    return { type: "ok" as const, rec, paid };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before visiting REC" });
  else if (result.type === "inventory") res.status(409).json({ error: "Recharge cell not owned" });
  else if (result.type === "funds") res.status(402).json({ error: "insufficient_fiat", spendable: result.paid.spendable });
  else res.json(result);
});

export default router;