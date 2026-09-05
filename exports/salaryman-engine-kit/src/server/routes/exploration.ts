import { Router, type Request, type Response } from "express";
import { db, playerExplorationTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Fog-of-war + waypoint endpoints.
 *
 * Tile IDs are coarse "qx,qy" strings derived client-side (worldX>>8 etc).
 * Vertical/non-surface layers prefix that coordinate (`u:qx,qy`) so their
 * fog-of-war never overlaps surface exploration.
 * We dedupe in Postgres so the client can fire-and-forget batches every few
 * seconds without worrying about local set hygiene. Waypoint is a single
 * world coordinate with an optional label that the compass HUD reads.
 *
 * No PII is involved here so the only requirement is that the user is logged in.
 */
const router = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.() || !req.user) { res.status(401).json({ error: "Login required" }); return false; }
  return true;
}
function uid(req: Request): string { return String((req.user as { id: string }).id); }

const MAX_TILES_PER_BATCH = 200;
const TILE_ID_RE = /^(?:[a-z][a-z0-9_-]*:)?-?\d+,-?\d+$/;
const MAX_LABEL_LEN = 80;

async function getOrCreate(userId: string) {
  const rows = await db.select().from(playerExplorationTable).where(eq(playerExplorationTable.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(playerExplorationTable).values({ userId, exploredTiles: [] }).returning();
  return created;
}

router.get("/exploration", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const row = await getOrCreate(userId);
  res.json({
    exploredTiles: row.exploredTiles ?? [],
    waypoint: row.waypointX != null && row.waypointY != null
      ? { x: row.waypointX, y: row.waypointY, label: row.waypointLabel ?? null }
      : null,
  });
});

/**
 * POST /api/exploration/visit
 * Body: { tiles: string[] }  // "qx,qy" or layered "u:qx,qy"
 * Merges into stored set. Caps batch size to keep payload sane.
 */
router.post("/exploration/visit", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const incoming = Array.isArray(req.body?.tiles) ? req.body.tiles as unknown[] : [];
  const clean = incoming
    .filter((t): t is string => typeof t === "string" && TILE_ID_RE.test(t))
    .slice(0, MAX_TILES_PER_BATCH);
  if (clean.length === 0) { res.json({ ok: true, added: 0 }); return; }

  // Use jsonb merge: combine arrays, then dedupe. Postgres has no native
  // jsonb set-union so we shuttle through unnest -> array_agg(distinct).
  const row = await getOrCreate(userId);
  const merged = Array.from(new Set([...(row.exploredTiles ?? []), ...clean]));
  await db.update(playerExplorationTable)
    .set({ exploredTiles: merged })
    .where(eq(playerExplorationTable.userId, userId));
  res.json({ ok: true, added: merged.length - (row.exploredTiles?.length ?? 0), total: merged.length });
});

router.post("/exploration/waypoint", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  const label = typeof req.body?.label === "string" ? req.body.label.slice(0, MAX_LABEL_LEN) : null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    res.status(400).json({ error: "x and y must be numbers" }); return;
  }
  await getOrCreate(userId);
  await db.update(playerExplorationTable)
    .set({ waypointX: Math.round(x), waypointY: Math.round(y), waypointLabel: label })
    .where(eq(playerExplorationTable.userId, userId));
  res.json({ ok: true });
});

router.post("/exploration/clear-waypoint", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = uid(req);
  await getOrCreate(userId);
  await db.update(playerExplorationTable)
    .set({ waypointX: null, waypointY: null, waypointLabel: null })
    .where(eq(playerExplorationTable.userId, userId));
  res.json({ ok: true });
});

// keep sql import "used" so prettier/lint don't complain in case future edits remove the only use above
void sql;

export default router;
