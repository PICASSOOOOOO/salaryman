import { Router } from "express";
import { db, billboardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isOwnerEmail } from "../lib/plan";

const router = Router();

let tableAvailable: boolean | null = null;

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('relation "billboards" does not exist') || msg.includes('relation "public.billboards" does not exist');
}

const BILLBOARD_LOCATIONS = [
  { locationId: "bb_west_main",    label: "WEST MAIN ST",       x: 460,  y: 270, price: 15000 },
  { locationId: "bb_west_market",  label: "MARKET DISTRICT",    x: 730,  y: 300, price: 12000 },
  { locationId: "bb_west_south",   label: "SOUTH WALL",         x: 350,  y: 650, price: 8000  },
  { locationId: "bb_east_plaza",   label: "EAST PLAZA",         x: 1350, y: 250, price: 14000 },
  { locationId: "bb_east_neon",    label: "NEON STRIP",         x: 1650, y: 350, price: 18000 },
  { locationId: "bb_east_gate",    label: "NORTH GATE",         x: 2100, y: 450, price: 10000 },
  { locationId: "bb_border_west",  label: "BORDER CROSSING W",  x: 250,  y: 780, price: 6000  },
  { locationId: "bb_border_east",  label: "BORDER CROSSING E",  x: 1500, y: 780, price: 6000  },
];

async function ensureBillboards() {
  const existing = await db.select().from(billboardsTable);
  const existingIds = new Set(existing.map(b => b.locationId));
  for (const loc of BILLBOARD_LOCATIONS) {
    if (!existingIds.has(loc.locationId)) {
      await db.insert(billboardsTable).values({
        locationId: loc.locationId,
        priceFlorin: loc.price,
      });
    }
  }
}

let initialized = false;

function isAdmin(req: Express.Request): boolean {
  return !!req.user && isOwnerEmail(req.user.email);
}

function getPlayerName(req: Express.Request): string | null {
  if (!req.user) return null;
  const name = req.user.firstName
    ? `${req.user.firstName}${req.user.lastName ? ' ' + req.user.lastName : ''}`
    : req.user.email?.split('@')[0] ?? null;
  return name;
}

router.get("/billboards", async (_req, res) => {
  try {
    if (tableAvailable === false) { res.json([]); return; }
    if (!initialized) { await ensureBillboards(); initialized = true; }
    const rows = await db.select().from(billboardsTable);
    const result = rows.map(r => {
      const loc = BILLBOARD_LOCATIONS.find(l => l.locationId === r.locationId);
      return {
        ...r,
        label: loc?.label ?? r.locationId,
        worldX: loc?.x ?? 0,
        worldY: loc?.y ?? 0,
        expired: r.rentedUntil ? new Date(r.rentedUntil) < new Date() : false,
      };
    });
    tableAvailable = true;
    res.json(result);
  } catch (err: any) {
    if (isMissingTableError(err)) {
      if (tableAvailable === null) console.warn("[Billboards] table does not exist — feature disabled");
      tableAvailable = false;
      res.json([]);
      return;
    }
    console.error("[Billboards] list error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/billboards/:id", async (req, res) => {
  try {
    if (tableAvailable === false) { res.status(404).json({ error: "Billboard not found" }); return; }
    const id = Number(req.params.id);
    const [row] = await db.select().from(billboardsTable).where(eq(billboardsTable.id, id));
    if (!row) { res.status(404).json({ error: "Billboard not found" }); return; }
    const loc = BILLBOARD_LOCATIONS.find(l => l.locationId === row.locationId);
    res.json({
      ...row,
      label: loc?.label ?? row.locationId,
      worldX: loc?.x ?? 0,
      worldY: loc?.y ?? 0,
      expired: row.rentedUntil ? new Date(row.rentedUntil) < new Date() : false,
    });
  } catch (err: any) {
    if (isMissingTableError(err)) { tableAvailable = false; res.status(404).json({ error: "Billboard not found" }); return; }
    console.error("[Billboards] get error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/billboards/:id/purchase", async (req, res) => {
  try {
    if (tableAvailable === false) { res.status(503).json({ error: "Billboards unavailable" }); return; }
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const id = Number(req.params.id);
    const { durationDays, currentBalance } = req.body;
    const playerName = getPlayerName(req) ?? req.user.id;

    const [row] = await db.select().from(billboardsTable).where(eq(billboardsTable.id, id));
    if (!row) { res.status(404).json({ error: "Billboard not found" }); return; }

    const isExpired = row.rentedUntil ? new Date(row.rentedUntil) < new Date() : true;
    if (row.ownerPlayerName && !isExpired) {
      res.status(409).json({ error: "Billboard is currently owned and not expired" });
      return;
    }

    const cost = row.priceFlorin;
    if (typeof currentBalance === 'number' && currentBalance < cost) {
      res.status(400).json({ error: `Insufficient CREAM. Need ç${cost.toLocaleString()}, have ç${currentBalance.toLocaleString()}` });
      return;
    }

    const days = Math.max(1, Math.min(30, Number(durationDays) || 7));
    const rentedUntil = new Date();
    rentedUntil.setDate(rentedUntil.getDate() + days);

    const [updated] = await db.update(billboardsTable)
      .set({
        ownerPlayerName: String(playerName).slice(0, 64),
        rentedUntil,
      })
      .where(eq(billboardsTable.id, id))
      .returning();

    res.json({ ok: true, billboard: updated, cost, newBalance: typeof currentBalance === 'number' ? currentBalance - cost : null });
  } catch (err: any) {
    if (isMissingTableError(err)) { tableAvailable = false; res.status(503).json({ error: "Billboards unavailable" }); return; }
    console.error("[Billboards] purchase error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/billboards/:id/update-content", async (req, res) => {
  try {
    if (tableAvailable === false) { res.status(503).json({ error: "Billboards unavailable" }); return; }
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    const id = Number(req.params.id);
    const { adText, adImageUrl } = req.body;
    const playerName = getPlayerName(req) ?? req.user.id;

    const [row] = await db.select().from(billboardsTable).where(eq(billboardsTable.id, id));
    if (!row) { res.status(404).json({ error: "Billboard not found" }); return; }

    const isAdminUser = isAdmin(req);
    if (!isAdminUser && row.ownerPlayerName?.toUpperCase() !== String(playerName).toUpperCase()) {
      res.status(403).json({ error: "You do not own this billboard" });
      return;
    }

    if (adImageUrl && typeof adImageUrl === 'string') {
      try { new URL(adImageUrl); } catch { res.status(400).json({ error: "Invalid image URL" }); return; }
    }

    const [updated] = await db.update(billboardsTable)
      .set({
        adText: adText !== undefined ? (adText ? String(adText).slice(0, 500) : null) : row.adText,
        adImageUrl: adImageUrl !== undefined ? (adImageUrl ? String(adImageUrl).slice(0, 2000) : null) : row.adImageUrl,
      })
      .where(eq(billboardsTable.id, id))
      .returning();

    res.json({ ok: true, billboard: updated });
  } catch (err: any) {
    if (isMissingTableError(err)) { tableAvailable = false; res.status(503).json({ error: "Billboards unavailable" }); return; }
    console.error("[Billboards] update-content error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/billboards/:id/set-price", async (req, res) => {
  try {
    if (tableAvailable === false) { res.status(503).json({ error: "Billboards unavailable" }); return; }
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

    const id = Number(req.params.id);
    const { priceFlorin } = req.body;
    if (!priceFlorin || Number(priceFlorin) <= 0) { res.status(400).json({ error: "Valid priceFlorin required" }); return; }

    const [row] = await db.select().from(billboardsTable).where(eq(billboardsTable.id, id));
    if (!row) { res.status(404).json({ error: "Billboard not found" }); return; }

    const [updated] = await db.update(billboardsTable)
      .set({ priceFlorin: Number(priceFlorin) })
      .where(eq(billboardsTable.id, id))
      .returning();

    res.json({ ok: true, billboard: updated });
  } catch (err: any) {
    if (isMissingTableError(err)) { tableAvailable = false; res.status(503).json({ error: "Billboards unavailable" }); return; }
    console.error("[Billboards] set-price error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/billboards/:id/release", async (req, res) => {
  try {
    if (tableAvailable === false) { res.status(503).json({ error: "Billboards unavailable" }); return; }
    if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin access required" }); return; }

    const id = Number(req.params.id);
    const { newPrice } = req.body;

    const [row] = await db.select().from(billboardsTable).where(eq(billboardsTable.id, id));
    if (!row) { res.status(404).json({ error: "Billboard not found" }); return; }

    const updates: Record<string, any> = {
      ownerPlayerName: null,
      adText: null,
      adImageUrl: null,
      rentedUntil: null,
    };
    if (newPrice && Number(newPrice) > 0) updates.priceFlorin = Number(newPrice);

    const [updated] = await db.update(billboardsTable)
      .set(updates)
      .where(eq(billboardsTable.id, id))
      .returning();

    res.json({ ok: true, billboard: updated });
  } catch (err: any) {
    if (isMissingTableError(err)) { tableAvailable = false; res.status(503).json({ error: "Billboards unavailable" }); return; }
    console.error("[Billboards] release error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
