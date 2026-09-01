import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  subwayStationsTable,
  userDiscoveredStationsTable,
  subwayTripsTable,
  bankAccountsTable,
  travelVouchersTable,
} from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { spendEarnedFiat } from "../lib/pablo-tax";
import { OUTSIDE_WORLD_DISABLED_BODY, OUTSIDE_WORLD_ENABLED } from "../lib/outside-world";

const router: IRouter = Router();

router.use("/subway", (_req, res, next) => {
  if (OUTSIDE_WORLD_ENABLED) return next();
  return res.status(410).json(OUTSIDE_WORLD_DISABLED_BODY);
});

// Flat cross-city toll, in whole ƒ (florins) — same unit as bank_accounts.balance
// and the armory's spendEarnedFiat. Only EARNED ƒ pays it (starting funds are
// quarantined), so it gates intercity spam without punishing established players.
// NOTE: keep this in sync with INTERCITY_FARE_FIAT in the Subway.tsx client.
export const INTERCITY_FARE_FIAT = 2500;

// How many free-travel vouchers this user currently holds.
async function getVoucherBalance(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ balance: travelVouchersTable.balance })
      .from(travelVouchersTable)
      .where(eq(travelVouchersTable.userId, userId))
      .limit(1);
    return row?.balance ?? 0;
  } catch {
    return 0;
  }
}

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

function distance(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Fare formula: distance ÷ 1 (1 unit ≈ 1ƒ), clamped to ƒ1,000–10,000.
// Stored as ƒ-cents (1 ƒ = 100 cents). 1ƒ = $0.001 USD per the FX table,
// so fares range $1–$10 USD-equivalent — sane gate against trivial spam.
function calcFareCents(d: number): number {
  const baseFiat = Math.round(d);
  const clamped = Math.max(1000, Math.min(10000, baseFiat));
  return clamped * 100;
}

// GET /api/subway/stations — returns all stations with discovered flag
router.get("/subway/stations", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const stations = await db.select().from(subwayStationsTable)
      .where(eq(subwayStationsTable.active, 1));
    let discovered: { stationId: number }[] = await db.select({ stationId: userDiscoveredStationsTable.stationId })
      .from(userDiscoveredStationsTable)
      .where(eq(userDiscoveredStationsTable.userId, userId));
    // First-time visitor: auto-grant the Civic Row hub so the page is usable.
    if (discovered.length === 0) {
      const hub = stations.find((s: { slug: string }) => s.slug === "civic-row");
      if (hub) {
        try { await db.insert(userDiscoveredStationsTable).values({ userId, stationId: hub.id }).onConflictDoNothing(); } catch { /* noop */ }
        discovered = [{ stationId: hub.id }];
      }
    }
    const discoveredSet = new Set(discovered.map((d: { stationId: number }) => d.stationId));
    res.json({
      stations: stations.map((s: typeof subwayStationsTable.$inferSelect) => ({ ...s, discovered: discoveredSet.has(s.id) })),
      // Free-travel vouchers (issued when a business owner's proper server is
      // full) so the client can show "voucher applied" instead of the toll.
      vouchers: await getVoucherBalance(userId),
      intercityFare: INTERCITY_FARE_FIAT,
    });
  } catch (e) {
    console.error("[Subway] list failed:", e);
    res.status(500).json({ error: "Failed to list stations" });
  }
});

// POST /api/subway/discover — mark a station as discovered if player is in range
// body: { stationId, x, y }
router.post("/subway/discover", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const stationId = Number(req.body?.stationId);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!stationId || !Number.isFinite(x) || !Number.isFinite(y)) {
      res.status(400).json({ error: "Missing stationId / x / y" }); return;
    }
    const [station] = await db.select().from(subwayStationsTable)
      .where(eq(subwayStationsTable.id, stationId)).limit(1);
    if (!station) { res.status(404).json({ error: "Station not found" }); return; }
    const d = distance(x, y, station.worldX, station.worldY);
    if (d > station.discoveryRadius) {
      res.status(403).json({ error: "Too far to discover this station", distance: Math.round(d) });
      return;
    }
    try {
      await db.insert(userDiscoveredStationsTable).values({ userId, stationId }).onConflictDoNothing();
    } catch {
      // unique violation = already discovered
    }
    res.json({ ok: true, discovered: true, station });
  } catch (e) {
    console.error("[Subway] discover failed:", e);
    res.status(500).json({ error: "Failed to discover station" });
  }
});

// POST /api/subway/discover-near — bulk proximity probe. Client ticks this
// from the world view with the player's current coords; server returns any
// stations newly unlocked by being within their discovery radius.
// body: { x, y }
router.post("/subway/discover-near", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const x = Number(req.body?.x), y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { res.status(400).json({ error: "x / y required" }); return; }

    const stations = await db.select().from(subwayStationsTable).where(eq(subwayStationsTable.active, 1));
    const already: { stationId: number }[] = await db.select({ stationId: userDiscoveredStationsTable.stationId })
      .from(userDiscoveredStationsTable).where(eq(userDiscoveredStationsTable.userId, userId));
    const known = new Set(already.map((a: { stationId: number }) => a.stationId));

    const newlyDiscovered: typeof stations = [];
    for (const s of stations) {
      if (known.has(s.id)) continue;
      if (distance(x, y, s.worldX, s.worldY) <= s.discoveryRadius) {
        try {
          await db.insert(userDiscoveredStationsTable).values({ userId, stationId: s.id }).onConflictDoNothing();
          newlyDiscovered.push(s);
        } catch { /* race */ }
      }
    }
    res.json({ ok: true, newlyDiscovered });
  } catch (e) {
    console.error("[Subway] discover-near failed:", e);
    res.status(500).json({ error: "Failed to probe" });
  }
});

// POST /api/subway/travel — charge fare and return destination coords
// body: { fromStationId, toStationId }
router.post("/subway/travel", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const fromId = Number(req.body?.fromStationId);
    const toId = Number(req.body?.toStationId);
    if (!fromId || !toId || fromId === toId) {
      res.status(400).json({ error: "Need distinct fromStationId and toStationId" }); return;
    }

    const stations = await db.select().from(subwayStationsTable)
      .where(sql`${subwayStationsTable.id} IN (${fromId}, ${toId})`);
    const from = stations.find((s: typeof subwayStationsTable.$inferSelect) => s.id === fromId);
    const to = stations.find((s: typeof subwayStationsTable.$inferSelect) => s.id === toId);
    if (!from || !to) { res.status(404).json({ error: "Station not found" }); return; }

    // Both endpoints must be discovered
    const discovered = await db.select({ stationId: userDiscoveredStationsTable.stationId })
      .from(userDiscoveredStationsTable)
      .where(and(
        eq(userDiscoveredStationsTable.userId, userId),
        sql`${userDiscoveredStationsTable.stationId} IN (${fromId}, ${toId})`,
      ));
    if (discovered.length < 2) {
      res.status(403).json({ error: "Both stations must be discovered" }); return;
    }

    const d = distance(from.worldX, from.worldY, to.worldX, to.worldY);
    const fareCents = calcFareCents(d);

    // Charge from earned bank (reuses existing player bank). The bank ledger
    // here mirrors player_bank_accounts.balance_cents which is the EARNED ƒ
    // pool (quarantined starting funds aren't usable, per spec).
    const [bank] = await db.select().from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, userId)).limit(1);
    const balance = bank?.balance ?? 0;
    if (balance < fareCents) {
      res.status(402).json({
        error: "Insufficient ƒ for fare",
        required: fareCents,
        balance,
      });
      return;
    }

    // Atomically deduct fare and record trip
    await db.transaction(async (tx: any) => {
      const [updated] = await tx.update(bankAccountsTable)
        .set({ balance: sql`${bankAccountsTable.balance} - ${fareCents}`, updatedAt: new Date() })
        .where(and(
          eq(bankAccountsTable.userId, userId),
          sql`${bankAccountsTable.balance} >= ${fareCents}`,
        ))
        .returning();
      if (!updated) throw new Error("INSUFFICIENT_FUNDS");
      await tx.insert(subwayTripsTable).values({
        userId,
        fromStationId: fromId,
        toStationId: toId,
        fareCents,
        distance: Math.round(d),
      });
    });

    res.json({
      ok: true,
      destination: { x: to.worldX, y: to.worldY, station: to },
      fareCents,
      distance: Math.round(d),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
      res.status(402).json({ error: "Insufficient ƒ for fare" }); return;
    }
    console.error("[Subway] travel failed:", e);
    res.status(500).json({ error: "Failed to travel" });
  }
});

// POST /api/subway/travel-intercity — charge the cross-city toll. Intercity
// travel itself is a client handoff (localStorage city_travel → WorldPlay), but
// the FARE is server-authoritative: we debit earned ƒ here, then the client runs
// the crossing cutscene and re-skins on arrival. body: { toCityId }
router.post("/subway/travel-intercity", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const toCityId = String(req.body?.toCityId ?? "").slice(0, 40);
  if (!toCityId) { res.status(400).json({ error: "toCityId required" }); return; }
  try {
    // Free-travel voucher first: a business owner whose proper server was full
    // gets a free crossing. Consume atomically (only if balance > 0) so it can't
    // be double-spent across concurrent requests.
    const redeemed = await db
      .update(travelVouchersTable)
      .set({ balance: sql`${travelVouchersTable.balance} - 1`, updatedAt: new Date() })
      .where(and(eq(travelVouchersTable.userId, userId), gt(travelVouchersTable.balance, 0)))
      .returning({ balance: travelVouchersTable.balance });
    if (redeemed.length > 0) {
      res.json({ ok: true, fareFiat: 0, voucher: true, vouchersLeft: redeemed[0].balance, toCityId });
      return;
    }

    const paid = await spendEarnedFiat({
      userId,
      amountFiat: INTERCITY_FARE_FIAT,
      description: `Intercity transit → ${toCityId}`,
    });
    if (!paid.ok) {
      res.status(402).json({ error: "insufficient_fiat", required: INTERCITY_FARE_FIAT, spendable: paid.spendable });
      return;
    }
    res.json({ ok: true, fareFiat: INTERCITY_FARE_FIAT, newBalance: paid.newBalance, toCityId });
  } catch (e) {
    console.error("[Subway] intercity travel failed:", e);
    res.status(500).json({ error: "Failed to travel" });
  }
});

export default router;

// Seed default stations on boot if the table is empty.
export async function seedSubwayStations() {
  if (!OUTSIDE_WORLD_ENABLED) return;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(subwayStationsTable);
  if (Number(count) > 0) return;
  const seed = [
    { slug: "civic-row", name: "CIVIC ROW STATION", district: "DOWNTOWN", worldX: 6800, worldY: 6300, discoveryRadius: 220, description: "The main downtown hub. Most lines pass through here." },
    { slug: "tower-quarter", name: "TOWER QUARTER STATION", district: "TOWER QUARTER", worldX: 6230, worldY: 5740, discoveryRadius: 200, description: "Corporate corridor. Suit-and-tie crowd, vending machines that take ƒ." },
    { slug: "neon-strip", name: "NEON STRIP STATION", district: "NEON STRIP", worldX: 6500, worldY: 5250, discoveryRadius: 200, description: "Late-night commercial district. Always something blinking." },
    { slug: "shadow-district", name: "SHADOW DISTRICT STATION", district: "SHADOW DISTRICT", worldX: 5550, worldY: 5200, discoveryRadius: 200, description: "Industrial fringe. Watch your back." },
    { slug: "industrial-sw", name: "INDUSTRIAL SW STATION", district: "INDUSTRIAL SW", worldX: 5550, worldY: 6000, discoveryRadius: 200, description: "Factory blocks. Smells like solvent and ambition." },
    { slug: "residential-east", name: "RESIDENTIAL EAST STATION", district: "RESIDENTIAL EAST", worldX: 7300, worldY: 5550, discoveryRadius: 200, description: "Apartment housing block. Quiet by day, lights on by night." },
  ];
  await db.insert(subwayStationsTable).values(seed);
  console.log(`[Subway] Seeded ${seed.length} stations.`);
}
