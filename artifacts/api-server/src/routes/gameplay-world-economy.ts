import { Router, type Request, type Response } from "express";
import {
  db,
  worldCargoTable,
  worldJobRunsTable,
  worldMarketQuotesTable,
  salarymanSavesTable,
} from "@workspace/db";
import { and, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { creditFiat, getSpendableFiat, spendFiat } from "../lib/fiat-wallet";
import { getPlayerPosition } from "../worldServer";

const router = Router();
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,128}$/;
const QUOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARGO_CAPACITY = 5;
const QUOTE_TTL_MS = 30_000;
const INTERACTION_RADIUS = 55;
export const MINIMUM_WAGE_FIAT_PER_HOUR = 300;
export const STANDARD_SHIFT_MS = 60_000;
// Centers/radius transcribed from WorldPlay's canonical BUILDINGS list. The
// old-city entries are 60x60 rectangles; the radius matches WorldPlay's
// building interaction range, not an untrusted browser-provided location.
const WORLD_BUILDING_CENTERS = {
  data_vault: { x: 5740, y: 7450 }, food_court: { x: 5950, y: 7450 },
  scrap: { x: 6090, y: 7450 }, nightclub: { x: 6230, y: 7450 },
  market: { x: 6330, y: 7450 }, oxide_labs: { x: 6400, y: 7450 },
  nexus_hub: { x: 6470, y: 7450 }, noodle_bar: { x: 6930, y: 7450 },
  print_shop: { x: 7140, y: 7450 }, radio: { x: 7210, y: 7450 },
  public_office: { x: 7350, y: 7450 }, pawn_shop: { x: 6230, y: 7520 },
  waste_exchange: { x: 6330, y: 7520 }, water_plants: { x: 6120, y: 7450 },
} as const;

export function locationForLivePlayer(userId: string): "city" | "waste" | null {
  const position = getPlayerPosition(userId);
  if (!position) return null;
  const candidates: Array<{ location: "city" | "waste"; x: number; y: number }> = [
    { location: "city", ...WORLD_BUILDING_CENTERS.market },
    { location: "waste", ...WORLD_BUILDING_CENTERS.waste_exchange },
  ];
  const nearest = candidates
    .map((candidate) => ({ ...candidate, distance: Math.hypot(position.x - candidate.x, position.y - candidate.y) }))
    .filter((candidate) => candidate.distance <= INTERACTION_RADIUS)
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest?.location ?? null;
}

export function isQuoteLocationAuthorized(userId: string, quoteLocation: string): boolean {
  return locationForLivePlayer(userId) === quoteLocation;
}

export function isNearJobBuilding(userId: string, jobId: keyof typeof QUICK_JOBS): boolean {
  const position = getPlayerPosition(userId);
  const center = WORLD_BUILDING_CENTERS[QUICK_JOBS[jobId].buildingId as keyof typeof WORLD_BUILDING_CENTERS];
  return Boolean(position && center && Math.hypot(position.x - center.x, position.y - center.y) <= INTERACTION_RADIUS);
}

export const QUICK_JOBS = {
  scrap: { buildingId: "scrap", label: "HAUL SCRAP", payFiat: 3_500, durationMs: 5_000, cooldownMs: 30_000 },
  print_shop: { buildingId: "print_shop", label: "PRINT RUN", payFiat: 2_500, durationMs: 4_000, cooldownMs: 20_000 },
  radio: { buildingId: "radio", label: "BROADCAST", payFiat: 2_000, durationMs: 4_000, cooldownMs: 15_000 },
  oxide_labs: { buildingId: "oxide_labs", label: "ASSEMBLE", payFiat: 6_000, durationMs: 7_000, cooldownMs: 40_000 },
  market: { buildingId: "market", label: "STREET DEAL", payFiat: 3_000, durationMs: 3_000, cooldownMs: 15_000 },
  public_office: { buildingId: "public_office", label: "DATA ENTRY", payFiat: 4_000, durationMs: 6_000, cooldownMs: 25_000 },
  data_vault: { buildingId: "data_vault", label: "DECRYPT FILES", payFiat: 5_500, durationMs: 8_000, cooldownMs: 35_000 },
  nexus_hub: { buildingId: "nexus_hub", label: "FREELANCE CODE", payFiat: 4_500, durationMs: 5_000, cooldownMs: 20_000 },
  noodle_bar: { buildingId: "noodle_bar", label: "DELIVERY RUN", payFiat: 1_500, durationMs: 3_000, cooldownMs: 10_000 },
  food_court: { buildingId: "food_court", label: "SERVE TABLES", payFiat: 1_800, durationMs: 3_000, cooldownMs: 10_000 },
  nightclub: { buildingId: "nightclub", label: "BOUNCER SHIFT", payFiat: 3_500, durationMs: 5_000, cooldownMs: 30_000 },
  pawn_shop: { buildingId: "pawn_shop", label: "APPRAISE GOODS", payFiat: 2_800, durationMs: 4_000, cooldownMs: 15_000 },
  water_plants: {
    buildingId: "water_plants",
    label: "WATER PLANTS",
    payFiat: MINIMUM_WAGE_FIAT_PER_HOUR,
    durationMs: STANDARD_SHIFT_MS,
    cooldownMs: 10_000,
  },
} as const;

export const COMMODITY_PRICES = {
  stims: { cityBuy: 2400, citySell: 1200, wasteBuy: 8500, wasteSell: 5500 },
  rations: { cityBuy: 1500, citySell: 800, wasteBuy: 500, wasteSell: 3200 },
  scrap: { cityBuy: 900, citySell: 400, wasteBuy: 300, wasteSell: 1800 },
  power: { cityBuy: 3000, citySell: 1800, wasteBuy: 6200, wasteSell: 5000 },
  weapons: { cityBuy: 5200, citySell: 2500, wasteBuy: 2500, wasteSell: 8500 },
  data: { cityBuy: 8000, citySell: 4500, wasteBuy: 3000, wasteSell: 15000 },
  implants: { cityBuy: 12000, citySell: 6000, wasteBuy: 5000, wasteSell: 18000 },
  intel: { cityBuy: 10000, citySell: 7000, wasteBuy: 4000, wasteSell: 22000 },
} as const;

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

function readSlot(value: unknown): number | null {
  const slot = typeof value === "string" && value !== "" ? Number(value) : value;
  return Number.isInteger(slot) && Number(slot) >= 0 && Number(slot) <= 99 ? Number(slot) : null;
}

function publicJob(run: typeof worldJobRunsTable.$inferSelect | undefined) {
  if (!run) return null;
  return {
    runId: run.id,
    jobId: run.jobId,
    buildingId: run.buildingId,
    label: run.label,
    payFiat: run.payFiat,
    durationMs: run.durationMs,
    startedAt: run.startedAt,
    completesAt: run.completesAt,
    completedAt: run.completedAt,
    cooldownUntil: run.cooldownUntil,
  };
}

function publicQuote(quote: typeof worldMarketQuotesTable.$inferSelect) {
  return {
    quoteId: quote.id,
    slot: quote.slotIndex,
    location: quote.location,
    commodityId: quote.commodityId,
    side: quote.side,
    quantity: quote.quantity,
    unitPriceFiat: quote.unitPriceFiat,
    totalFiat: quote.totalFiat,
    expiresAt: quote.expiresAt,
    consumedAt: quote.consumedAt,
  };
}

async function cargoFor(userId: string, slot: number) {
  const rows = await db.select({ commodityId: worldCargoTable.commodityId, quantity: worldCargoTable.quantity })
    .from(worldCargoTable)
    .where(and(eq(worldCargoTable.userId, userId), eq(worldCargoTable.slotIndex, slot), gt(worldCargoTable.quantity, 0)));
  const items = Object.fromEntries(rows.map((row) => [row.commodityId, row.quantity]));
  return { items, totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0), capacity: CARGO_CAPACITY };
}

router.post("/gameplay/jobs/start", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const slot = readSlot(req.body?.slot);
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "";
  const job = QUICK_JOBS[jobId as keyof typeof QUICK_JOBS];
  if (slot === null || !job || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    res.status(400).json({ error: "invalid_job_start" });
    return;
  }
  if (!isNearJobBuilding(userId, jobId as keyof typeof QUICK_JOBS)) {
    res.status(409).json({ error: "job_location_required" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${slot}:jobs`}))`);
      const [replay] = await tx.select().from(worldJobRunsTable).where(and(
        eq(worldJobRunsTable.userId, userId),
        eq(worldJobRunsTable.slotIndex, slot),
        eq(worldJobRunsTable.startIdempotencyKey, idempotencyKey),
      )).limit(1);
      if (replay) return { kind: "ok" as const, run: replay, duplicate: true };
      const [active] = await tx.select().from(worldJobRunsTable).where(and(
        eq(worldJobRunsTable.userId, userId),
        eq(worldJobRunsTable.slotIndex, slot),
        isNull(worldJobRunsTable.completedAt),
      )).limit(1);
      if (active) return { kind: "active" as const, run: active };
      const [cooldown] = await tx.select().from(worldJobRunsTable).where(and(
        eq(worldJobRunsTable.userId, userId),
        eq(worldJobRunsTable.slotIndex, slot),
        eq(worldJobRunsTable.jobId, jobId),
        gt(worldJobRunsTable.cooldownUntil, new Date()),
      )).orderBy(desc(worldJobRunsTable.completedAt)).limit(1);
      if (cooldown) return { kind: "cooldown" as const, run: cooldown };
      const now = new Date();
      const [save] = await tx.select().from(salarymanSavesTable).where(and(
        eq(salarymanSavesTable.userId, userId),
        eq(salarymanSavesTable.slotIndex, slot),
      )).for("update").limit(1);
      const saveData = { ...((save?.data ?? {}) as Record<string, any>) };
      const boost = saveData.workIncomeBoost as { percent?: number; remainingJobs?: number } | undefined;
      const boostPct = Math.max(0, Math.min(100, Number(boost?.percent ?? 0)));
      const boostedPayFiat = Math.round(job.payFiat * (1 + boostPct / 100));
      if (save && boostPct > 0 && Number(boost?.remainingJobs ?? 0) > 0) {
        const remainingJobs = Number(boost!.remainingJobs) - 1;
        if (remainingJobs > 0) saveData.workIncomeBoost = { ...boost, remainingJobs };
        else delete saveData.workIncomeBoost;
        await tx.update(salarymanSavesTable).set({ data: saveData }).where(eq(salarymanSavesTable.id, save.id));
      }
      const [run] = await tx.insert(worldJobRunsTable).values({
        userId, slotIndex: slot, jobId, startIdempotencyKey: idempotencyKey,
        buildingId: job.buildingId, label: job.label, payFiat: boostedPayFiat,
        durationMs: job.durationMs, cooldownMs: job.cooldownMs,
        completesAt: new Date(now.getTime() + job.durationMs),
      }).returning();
      return { kind: "ok" as const, run, duplicate: false };
    });
    if (result.kind !== "ok") {
      res.status(409).json({ error: result.kind === "active" ? "job_already_active" : "job_on_cooldown", job: publicJob(result.run) });
      return;
    }
    res.json({ ok: true, duplicate: result.duplicate, job: publicJob(result.run) });
  } catch {
    res.status(500).json({ error: "job_start_failed" });
  }
});

router.post("/gameplay/jobs/:runId/complete", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const runId = typeof req.params.runId === "string" ? req.params.runId : "";
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "";
  if (!QUOTE_ID.test(runId) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    res.status(400).json({ error: "invalid_job_completion" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [run] = await tx.select().from(worldJobRunsTable)
        .where(and(eq(worldJobRunsTable.id, runId), eq(worldJobRunsTable.userId, userId)))
        .for("update").limit(1);
      if (!run) return { kind: "missing" as const };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${run.slotIndex}:jobs`}))`);
      if (run.completedAt) {
        if (run.completeIdempotencyKey !== idempotencyKey) return { kind: "consumed" as const, run };
        const wallet = await creditFiat(tx, {
          userId, amountFiat: run.payFiat, kind: "world_job",
          description: `Quick job ${run.jobId} run ${run.id}`, idempotencyKey: `job-${run.id}`,
        });
        return { kind: "ok" as const, run, wallet, duplicate: true };
      }
      const now = new Date();
      if (now < run.completesAt) return { kind: "early" as const, run };
      const completedAt = now;
      const cooldownUntil = new Date(now.getTime() + run.cooldownMs);
      const [completed] = await tx.update(worldJobRunsTable).set({
        completedAt, cooldownUntil, completeIdempotencyKey: idempotencyKey,
      }).where(and(eq(worldJobRunsTable.id, run.id), isNull(worldJobRunsTable.completedAt))).returning();
      if (!completed) throw new Error("Concurrent job completion");
      const wallet = await creditFiat(tx, {
        userId, amountFiat: run.payFiat, kind: "world_job",
        description: `Quick job ${run.jobId} run ${run.id}`, idempotencyKey: `job-${run.id}`,
      });
      return { kind: "ok" as const, run: completed, wallet, duplicate: false };
    });
    if (result.kind === "missing") { res.status(404).json({ error: "job_not_found" }); return; }
    if (result.kind === "early") { res.status(409).json({ error: "job_not_ready", job: publicJob(result.run) }); return; }
    if (result.kind === "consumed") { res.status(409).json({ error: "job_already_completed", job: publicJob(result.run) }); return; }
    res.json({ ok: true, duplicate: result.duplicate, job: publicJob(result.run), wallet: result.wallet });
  } catch {
    res.status(500).json({ error: "job_completion_failed" });
  }
});

router.get("/gameplay/jobs/status", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const slot = readSlot(req.query.slot);
  if (slot === null) { res.status(400).json({ error: "invalid_slot" }); return; }
  const [active] = await db.select().from(worldJobRunsTable).where(and(
    eq(worldJobRunsTable.userId, userId), eq(worldJobRunsTable.slotIndex, slot), isNull(worldJobRunsTable.completedAt),
  )).orderBy(desc(worldJobRunsTable.startedAt)).limit(1);
  const cooldowns = await db.select().from(worldJobRunsTable).where(and(
    eq(worldJobRunsTable.userId, userId), eq(worldJobRunsTable.slotIndex, slot),
    gt(worldJobRunsTable.cooldownUntil, new Date()),
  )).orderBy(desc(worldJobRunsTable.completedAt));
  res.json({ ok: true, serverNow: new Date(), activeJob: publicJob(active), cooldowns: cooldowns.map(publicJob), wallet: await getSpendableFiat(userId) });
});

router.post("/gameplay/market/quote", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const slot = readSlot(req.body?.slot);
  const side = req.body?.side;
  const quantity = Number.isInteger(req.body?.quantity) ? Number(req.body.quantity) : null;
  const commodityId = typeof req.body?.commodityId === "string" ? req.body.commodityId : "";
  const prices = COMMODITY_PRICES[commodityId as keyof typeof COMMODITY_PRICES];
  if (slot === null || (side !== "buy" && side !== "sell")
    || quantity === null || quantity < 1 || quantity > CARGO_CAPACITY || !prices) {
    res.status(400).json({ error: "invalid_market_quote" });
    return;
  }
  const location = locationForLivePlayer(userId);
  if (!location) { res.status(409).json({ error: "market_location_required" }); return; }
  const priceKey = `${location}${side === "buy" ? "Buy" : "Sell"}` as keyof typeof prices;
  const unitPriceFiat = prices[priceKey];
  const [quote] = await db.insert(worldMarketQuotesTable).values({
    userId, slotIndex: slot, location, side, commodityId, quantity,
    unitPriceFiat, totalFiat: unitPriceFiat * quantity,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
  }).returning();
  res.json({ ok: true, quote: publicQuote(quote) });
});

router.get("/gameplay/market/catalog", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const location = locationForLivePlayer(userId);
  if (!location) { res.status(409).json({ error: "market_location_required" }); return; }
  res.json({ ok: true, location, prices: COMMODITY_PRICES, capacity: CARGO_CAPACITY });
});

router.post("/gameplay/market/execute", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId : "";
  const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "";
  if (!QUOTE_ID.test(quoteId) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    res.status(400).json({ error: "invalid_market_execution" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [quote] = await tx.select().from(worldMarketQuotesTable)
        .where(and(eq(worldMarketQuotesTable.id, quoteId), eq(worldMarketQuotesTable.userId, userId)))
        .for("update").limit(1);
      if (!quote) return { kind: "missing" as const };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${quote.slotIndex}:market`}))`);
      if (quote.consumedAt) {
        if (quote.executionIdempotencyKey !== idempotencyKey) return { kind: "consumed" as const, quote };
        return { kind: "replay" as const, quote };
      }
      if (new Date() >= quote.expiresAt) return { kind: "expired" as const, quote };
      if (!isQuoteLocationAuthorized(userId, quote.location)) return { kind: "location" as const, quote };
      const cargoRows = await tx.select().from(worldCargoTable).where(and(
        eq(worldCargoTable.userId, userId), eq(worldCargoTable.slotIndex, quote.slotIndex),
      )).for("update");
      const totalCargo = cargoRows.reduce((sum, row) => sum + row.quantity, 0);
      let wallet;
      if (quote.side === "buy") {
        if (totalCargo + quote.quantity > CARGO_CAPACITY) return { kind: "capacity" as const, quote };
        wallet = await spendFiat(tx, {
          userId, amountFiat: quote.totalFiat, kind: "world_purchase",
          description: `Commodity buy quote ${quote.id}`, idempotencyKey: `market-${quote.id}`,
        });
        if (!wallet.ok) return { kind: "funds" as const, quote, spendable: wallet.spendable };
        await tx.insert(worldCargoTable).values({
          userId, slotIndex: quote.slotIndex, commodityId: quote.commodityId, quantity: quote.quantity,
        }).onConflictDoUpdate({
          target: [worldCargoTable.userId, worldCargoTable.slotIndex, worldCargoTable.commodityId],
          set: { quantity: sql`${worldCargoTable.quantity} + ${quote.quantity}`, updatedAt: new Date() },
        });
      } else {
        const [updated] = await tx.update(worldCargoTable).set({
          quantity: sql`${worldCargoTable.quantity} - ${quote.quantity}`, updatedAt: new Date(),
        }).where(and(
          eq(worldCargoTable.userId, userId),
          eq(worldCargoTable.slotIndex, quote.slotIndex),
          eq(worldCargoTable.commodityId, quote.commodityId),
          gte(worldCargoTable.quantity, quote.quantity),
        )).returning();
        if (!updated) return { kind: "cargo" as const, quote };
        wallet = await creditFiat(tx, {
          userId, amountFiat: quote.totalFiat, kind: "world_sale",
          description: `Commodity sell quote ${quote.id}`, idempotencyKey: `market-${quote.id}`,
        });
      }
      const [consumed] = await tx.update(worldMarketQuotesTable).set({
        consumedAt: new Date(), executionIdempotencyKey: idempotencyKey,
      }).where(and(eq(worldMarketQuotesTable.id, quote.id), isNull(worldMarketQuotesTable.consumedAt))).returning();
      if (!consumed) throw new Error("Concurrent quote execution");
      const rows = await tx.select({ commodityId: worldCargoTable.commodityId, quantity: worldCargoTable.quantity })
        .from(worldCargoTable).where(and(
          eq(worldCargoTable.userId, userId), eq(worldCargoTable.slotIndex, quote.slotIndex), gt(worldCargoTable.quantity, 0),
        ));
      return {
        kind: "ok" as const, quote: consumed, wallet,
        cargo: { items: Object.fromEntries(rows.map((row) => [row.commodityId, row.quantity])), totalQuantity: rows.reduce((s, r) => s + r.quantity, 0), capacity: CARGO_CAPACITY },
      };
    });
    if (result.kind === "missing") { res.status(404).json({ error: "quote_not_found" }); return; }
    if (result.kind === "expired") { res.status(409).json({ error: "quote_expired", quote: publicQuote(result.quote) }); return; }
    if (result.kind === "location") { res.status(409).json({ error: "market_location_required", quote: publicQuote(result.quote) }); return; }
    if (result.kind === "consumed") { res.status(409).json({ error: "quote_already_consumed", quote: publicQuote(result.quote) }); return; }
    if (result.kind === "capacity") { res.status(409).json({ error: "cargo_capacity_exceeded", capacity: CARGO_CAPACITY }); return; }
    if (result.kind === "cargo") { res.status(409).json({ error: "insufficient_cargo" }); return; }
    if (result.kind === "funds") { res.status(402).json({ error: "insufficient_fiat", required: result.quote.totalFiat, spendable: result.spendable }); return; }
    if (result.kind === "replay") {
      res.json({ ok: true, duplicate: true, quote: publicQuote(result.quote), wallet: await getSpendableFiat(userId), cargo: await cargoFor(userId, result.quote.slotIndex) });
      return;
    }
    res.json({ ok: true, duplicate: false, quote: publicQuote(result.quote), wallet: result.wallet, cargo: result.cargo });
  } catch {
    res.status(500).json({ error: "market_execution_failed" });
  }
});

router.get("/gameplay/market/cargo", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const slot = readSlot(req.query.slot);
  if (slot === null) { res.status(400).json({ error: "invalid_slot" }); return; }
  res.json({ ok: true, cargo: await cargoFor(userId, slot), wallet: await getSpendableFiat(userId) });
});

export default router;