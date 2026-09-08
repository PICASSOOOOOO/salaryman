import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, orgAccountsTable, orgAccountTransactionsTable, orgMembersTable,
  playerInventoryTable, restBedBookingsTable, restBedsTable, salarymanSavesTable,
  hasRoleAccess, REST_BED_TYPES, type OrgRole,
} from "@workspace/db";
import { getMezzaninePlan, getRecreationPlan, getRestFloorPlan, getSecurityPlan, type ShadowTowerCity } from "@workspace/api-zod/shadow-tower";
import { creditFiat, getSpendableFiat, spendFiat } from "../lib/fiat-wallet";
import {
  CLASSIC_ARCADE_GAME_IDS, REC_GAMES, REC_ITEMS, REC_SPONSORS, findRecItem, getClassicArcadePrice, isClassicArcadeGameId, isRecGameId,
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

router.get("/shadow-tower/public-floor/:floor", (req, res) => {
  if (!requireAuth(req, res)) return;
  const floor = Number(req.params.floor);
  if (floor !== 2 && floor !== 3 && floor !== 4) {
    res.status(404).json({ error: "Public floor not found" });
    return;
  }
  const city = req.query.city === "huda_city" ? "huda_city" : "minx_city";
  res.json({
    floor: {
      id: floor === 2 ? "public-mezzanine" : floor === 3 ? "public-rest" : "public-security",
      city, floorNumber: floor, classification: "public", tenure: "system",
      archetype: floor === 2 ? "mezzanine" : floor === 3 ? "rest" : "security",
    },
    plan: floor === 2 ? getMezzaninePlan(city as ShadowTowerCity) : floor === 3 ? getRestFloorPlan(city as ShadowTowerCity) : getSecurityPlan(city as ShadowTowerCity),
  });
});

router.get("/public-floor/beds", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const cityId = req.query.city === "huda_city" ? "huda_city" : "minx_city";
  const beds = await db.select().from(restBedsTable)
    .where(and(eq(restBedsTable.cityId, cityId), eq(restBedsTable.active, true)))
    .orderBy(restBedsTable.hourlyRateFiat, restBedsTable.id);
  const active = await db.select({
    bedId: restBedBookingsTable.bedId,
    endsAt: restBedBookingsTable.endsAt,
  }).from(restBedBookingsTable)
    .where(sql`${restBedBookingsTable.endsAt} > now()`)
    .orderBy(desc(restBedBookingsTable.endsAt));
  const occupied = new Map(active.map((booking) => [booking.bedId, booking.endsAt]));
  res.json({ beds: beds.map((bed) => ({ ...bed, occupiedUntil: occupied.get(bed.id) ?? null })) });
});

router.post("/public-floor/beds", async (req, res) => {
  const ownerUserId = requireAuth(req, res);
  if (!ownerUserId) return;
  const orgId = req.body?.orgId == null ? null : Number(req.body.orgId);
  if (orgId != null) {
    const [member] = await db.select({ role: orgMembersTable.role }).from(orgMembersTable).where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.userId, ownerUserId),
      eq(orgMembersTable.status, "active"),
    )).limit(1);
    if (!member || !hasRoleAccess(member.role as OrgRole, "manager")) {
      res.status(403).json({ error: "Manager access required to operate an organization bed" });
      return;
    }
  }
  const name = String(req.body?.name ?? "").trim().slice(0, 120);
  const roomType = REST_BED_TYPES.includes(req.body?.roomType) ? req.body.roomType : "other";
  const hourlyRateFiat = Math.floor(Number(req.body?.hourlyRateFiat));
  const staminaPerHour = Math.floor(Number(req.body?.staminaPerHour ?? 35));
  if (!name || !Number.isFinite(hourlyRateFiat) || hourlyRateFiat < 1 || hourlyRateFiat > 100_000) {
    res.status(400).json({ error: "Name and an hourly rate from ƒ1 to ƒ100,000 are required" });
    return;
  }
  const [bed] = await db.insert(restBedsTable).values({
    ownerUserId,
    orgId,
    cityId: req.body?.cityId === "huda_city" ? "huda_city" : "minx_city",
    bedKey: `bed-${randomUUID()}`,
    name,
    roomType,
    description: typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 300) : null,
    hourlyRateFiat,
    staminaPerHour: Math.max(5, Math.min(100, Number.isFinite(staminaPerHour) ? staminaPerHour : 35)),
    rechargeConsumables: req.body?.rechargeConsumables !== false,
  }).returning();
  res.status(201).json({ bed });
});

router.post("/public-floor/beds/:bedId/book", async (req, res) => {
  const renterUserId = requireAuth(req, res);
  const slotIndex = slotOf(req.body?.slotIndex);
  const hours = Math.floor(Number(req.body?.hours ?? 1));
  const bedId = Number(req.params.bedId);
  if (!renterUserId || slotIndex == null || !Number.isInteger(bedId) || hours < 1 || hours > 24 || !validRequestId(req.body?.requestId)) {
    if (renterUserId) res.status(400).json({ error: "Valid bed, slot, requestId, and 1-24 hours required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [duplicate] = await tx.select().from(restBedBookingsTable).where(and(
      eq(restBedBookingsTable.renterUserId, renterUserId),
      eq(restBedBookingsTable.requestId, req.body.requestId),
    )).limit(1);
    if (duplicate) return { type: "ok" as const, duplicate: true, booking: duplicate };
    const [bed] = await tx.select().from(restBedsTable)
      .where(and(eq(restBedsTable.id, bedId), eq(restBedsTable.active, true))).for("update").limit(1);
    if (!bed) return { type: "missing" as const };
    const [occupied] = await tx.select().from(restBedBookingsTable)
      .where(and(eq(restBedBookingsTable.bedId, bed.id), sql`${restBedBookingsTable.endsAt} > now()`))
      .orderBy(desc(restBedBookingsTable.endsAt)).limit(1);
    if (occupied) return { type: "occupied" as const, occupiedUntil: occupied.endsAt };
    const save = await lockedSave(tx, renterUserId, slotIndex);
    if (!save) return { type: "save" as const };
    const amountFiat = bed.hourlyRateFiat * hours;
    const paid = await spendFiat(tx, {
      userId: renterUserId,
      amountFiat,
      description: `${bed.name} — ${hours} bed hour${hours === 1 ? "" : "s"}`,
      kind: "rest_bed",
      idempotencyKey: `rest-bed:${renterUserId}:${req.body.requestId}`,
    });
    if (!paid.ok) return { type: "funds" as const, paid, amountFiat };
    if (bed.orgId) {
      await tx.insert(orgAccountsTable).values({ orgId: bed.orgId, type: "checking", label: "Operating" })
        .onConflictDoNothing({ target: [orgAccountsTable.orgId, orgAccountsTable.type] });
      const [account] = await tx.update(orgAccountsTable)
        .set({ balanceFiat: sql`${orgAccountsTable.balanceFiat} + ${amountFiat}` })
        .where(and(eq(orgAccountsTable.orgId, bed.orgId), eq(orgAccountsTable.type, "checking")))
        .returning({ balanceFiat: orgAccountsTable.balanceFiat });
      await tx.insert(orgAccountTransactionsTable).values({
        orgId: bed.orgId, accountType: "checking", delta: amountFiat,
        balanceAfter: account.balanceFiat, description: `${bed.name} bed booking`,
        category: "hospitality", actorUserId: renterUserId,
      });
    } else {
      await creditFiat(tx, {
        userId: bed.ownerUserId, amountFiat,
        description: `${bed.name} bed income`, kind: "rest_bed_income",
        idempotencyKey: `rest-bed-income:${renterUserId}:${req.body.requestId}`,
      });
    }
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + hours * 3_600_000);
    const [booking] = await tx.insert(restBedBookingsTable).values({
      bedId: bed.id, renterUserId, slotIndex, requestId: req.body.requestId,
      hours, amountFiat, startsAt, endsAt,
    }).returning();
    const rec = normalizeRecState(save.data.rec);
    rec.stamina = Math.min(100, rec.stamina + bed.staminaPerHour * hours);
    rec.staminaUpdatedAt = startsAt.toISOString();
    const recharged: string[] = [];
    if (bed.rechargeConsumables) {
      const owned = await tx.select({ itemId: playerInventoryTable.itemId }).from(playerInventoryTable).where(and(
        eq(playerInventoryTable.userId, renterUserId), eq(playerInventoryTable.slotIndex, slotIndex),
      ));
      for (const item of REC_ITEMS) {
        if (!("maxCharges" in item) || !owned.some((row) => row.itemId === item.id)) continue;
        rec.charges[item.id] = item.maxCharges;
        recharged.push(item.id);
      }
    }
    await saveRec(tx, save, rec);
    return { type: "ok" as const, bed, booking, rec, recharged, wallet: paid };
  });
  if (result.type === "missing") res.status(404).json({ error: "Bed not found" });
  else if (result.type === "occupied") res.status(409).json({ error: "Bed is occupied", occupiedUntil: result.occupiedUntil });
  else if (result.type === "save") res.status(409).json({ error: "Create a character before booking" });
  else if (result.type === "funds") res.status(402).json({ error: "insufficient_fiat", required: result.amountFiat, spendable: result.paid.spendable });
  else res.json(result);
});

router.post("/public-floor/terminal-hour", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  if (!userId || slotIndex == null || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid slot and requestId required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex);
    if (!save) return { type: "missing" as const };
    const data = save.data as Record<string, unknown>;
    const publicFloor = data.publicFloor && typeof data.publicFloor === "object"
      ? { ...(data.publicFloor as Record<string, unknown>) }
      : {};
    const processed = Array.isArray(publicFloor.processed) ? publicFloor.processed.filter((id): id is string => typeof id === "string") : [];
    if (processed.includes(req.body.requestId)) return { type: "ok" as const, duplicate: true, passExpiresAt: publicFloor.passExpiresAt };
    const now = Date.now();
    const currentExpiry = typeof publicFloor.passExpiresAt === "string" ? new Date(publicFloor.passExpiresAt).getTime() : 0;
    const passExpiresAt = new Date(Math.max(now, Number.isFinite(currentExpiry) ? currentExpiry : 0) + 3_600_000).toISOString();
    publicFloor.passExpiresAt = passExpiresAt;
    publicFloor.processed = [...processed, req.body.requestId].slice(-80);
    await tx.update(salarymanSavesTable).set({ data: { ...data, publicFloor }, lastSavedAt: new Date() })
      .where(eq(salarymanSavesTable.id, save.id));
    return { type: "ok" as const, passExpiresAt, priceFiat: 0, free: true };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before using the cafe" });
  else res.json(result);
});

router.post("/public-floor/rest", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  if (!userId || slotIndex == null || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: "Valid slot and requestId required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex);
    if (!save) return null;
    const rec = normalizeRecState(save.data.rec);
    if (rec.processed.includes(req.body.requestId)) return { rec, duplicate: true };
    rec.stamina = Math.min(100, rec.stamina + 35);
    rec.staminaUpdatedAt = new Date().toISOString();
    rec.processed = [...rec.processed, req.body.requestId].slice(-80);
    await saveRec(tx, save, rec);
    return { rec, attendedBy: rec.stamina < 50 ? "DOCTOR" : "NURSE", observationSeconds: 60 };
  });
  if (!result) res.status(409).json({ error: "Create a character before resting" });
  else res.json(result);
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

router.post("/recreation/arcade/charge", async (req, res) => {
  const userId = requireAuth(req, res); const slotIndex = slotOf(req.body?.slotIndex);
  const gameId = req.body?.gameId;
  if (!userId || slotIndex == null || !isClassicArcadeGameId(gameId) || !validRequestId(req.body?.requestId)) {
    if (userId) res.status(400).json({ error: `Valid slot, classic game (${CLASSIC_ARCADE_GAME_IDS.join(", ")}), and requestId required` });
    return;
  }
  const priceFiat = getClassicArcadePrice(gameId);
  const result = await db.transaction(async (tx) => {
    const save = await lockedSave(tx, userId, slotIndex); if (!save) return { type: "missing" as const };
    const rec = normalizeRecState(save.data.rec);
    const paid = await spendFiat(tx, {
      userId, amountFiat: priceFiat, description: `REC classic arcade: ${gameId}`,
      kind: "rec_arcade", idempotencyKey: `rec-arcade:${req.body.requestId}`,
    });
    if (!paid.ok) return { type: "funds" as const, paid, priceFiat };
    if (!rec.processed.includes(req.body.requestId)) {
      rec.processed = [...rec.processed, req.body.requestId].slice(-80);
      await saveRec(tx, save, rec);
    }
    return { type: "ok" as const, charged: !paid.duplicate, gameId, priceFiat, wallet: paid };
  });
  if (result.type === "missing") res.status(409).json({ error: "Create a character before visiting REC" });
  else if (result.type === "funds") res.status(402).json({ error: "insufficient_fiat", required: result.priceFiat, spendable: result.paid.spendable });
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