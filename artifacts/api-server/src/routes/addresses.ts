import { Router, type IRouter, type Request } from "express";
import { db, addressesTable, ADDRESS_OWNER_TYPES } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.()) return null;
  return req.user?.id ?? null;
}

// District configs — drives postal codes and street naming.
const DISTRICT_INFO: Record<string, { postalPrefix: string; streets: string[] }> = {
  DOWNTOWN: { postalPrefix: "DT", streets: ["Civic Row", "Bureau Ave", "Concord Pike"] },
  "TOWER QUARTER": { postalPrefix: "TQ", streets: ["Glass Spine Ave", "Vault Street", "Director's Walk"] },
  "NEON STRIP": { postalPrefix: "NS", streets: ["Vapor Lane", "Static Boulevard", "Karaoke Row"] },
  "SHADOW DISTRICT": { postalPrefix: "SD", streets: ["Backalley", "Rust Lane", "Cinder Way"] },
  "INDUSTRIAL SW": { postalPrefix: "IS", streets: ["Foundry Road", "Slag Drive", "Conveyor Court"] },
  "RESIDENTIAL EAST": { postalPrefix: "RE", streets: ["Curfew Crescent", "Tenement Row", "Quiet Court"] },
};

function pickStreet(district: string, seed: number): string {
  const info = DISTRICT_INFO[district] ?? { postalPrefix: "XX", streets: ["Unnamed Way"] };
  return info.streets[seed % info.streets.length];
}

function postalFor(district: string, n: number): string {
  const info = DISTRICT_INFO[district] ?? { postalPrefix: "XX", streets: [] };
  return `${info.postalPrefix}-${String(n).padStart(4, "0")}`;
}

// POST /api/addresses/issue — issue a unique address for an owner.
// body: { ownerType, ownerId, district, worldX, worldY, label?, floor?, unit? }
router.post("/addresses/issue", async (req, res) => {
  const requesterId = getUserId(req);
  if (!requesterId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { ownerType, ownerId, district, worldX, worldY, label, floor, unit } = req.body ?? {};
    if (!ADDRESS_OWNER_TYPES.includes(ownerType)) { res.status(400).json({ error: "Invalid ownerType" }); return; }
    if (!ownerId) { res.status(400).json({ error: "ownerId required" }); return; }
    if (!district) { res.status(400).json({ error: "district required" }); return; }
    if (!Number.isFinite(Number(worldX)) || !Number.isFinite(Number(worldY))) {
      res.status(400).json({ error: "worldX / worldY required" }); return;
    }

    // Generate the next street number for this district by counting existing
    // rows. Cheap and good enough at this scale.
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(addressesTable)
      .where(eq(addressesTable.district, district));
    const nextNum = Number(count) + 1;
    const street = pickStreet(district, nextNum);
    const streetNumber = String(100 + nextNum * 2);
    const postalCode = postalFor(district, nextNum);

    const [row] = await db.insert(addressesTable).values({
      ownerType,
      ownerId: String(ownerId),
      district,
      street,
      streetNumber,
      postalCode,
      worldX: Math.round(Number(worldX)),
      worldY: Math.round(Number(worldY)),
      floor: Number.isFinite(Number(floor)) ? Number(floor) : null,
      unit: unit ? String(unit).slice(0, 24) : null,
      label: label ? String(label).slice(0, 160) : null,
    }).returning();

    res.status(201).json({ address: row, formatted: formatAddress(row) });
  } catch (e) {
    console.error("[Addresses] issue failed:", e);
    res.status(500).json({ error: "Failed to issue address" });
  }
});

// GET /api/addresses/me — list addresses owned by the current user
router.get("/addresses/me", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const rows = await db.select().from(addressesTable)
      .where(and(eq(addressesTable.ownerType, "user"), eq(addressesTable.ownerId, userId)));
    res.json({ addresses: rows.map((r: typeof addressesTable.$inferSelect) => ({ ...r, formatted: formatAddress(r) })) });
  } catch (e) {
    console.error("[Addresses] me failed:", e);
    res.status(500).json({ error: "Failed to list addresses" });
  }
});

// GET /api/addresses/:id — public single address lookup (for postal routing)
router.get("/addresses/:id", async (req, res) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(addressesTable).where(eq(addressesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Address not found" }); return; }
    res.json({ address: row, formatted: formatAddress(row) });
  } catch (e) {
    console.error("[Addresses] lookup failed:", e);
    res.status(500).json({ error: "Failed to lookup address" });
  }
});

function formatAddress(a: typeof addressesTable.$inferSelect): string {
  const parts: string[] = [];
  if (a.unit) parts.push(`Unit ${a.unit}`);
  if (a.floor !== null && a.floor !== undefined) parts.push(`Floor ${a.floor}`);
  parts.push(`${a.streetNumber} ${a.street}`);
  parts.push(a.district);
  parts.push(a.postalCode);
  return parts.join(", ");
}

export default router;
