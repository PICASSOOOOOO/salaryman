import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, artAssetsTable, type ArtAsset } from "@workspace/db";
import { createImageTask, getTaskRecord, isNanoBananaConfigured } from "../lib/nano-banana";
import {
  SALARYMAN_ART_KIT,
  composeSalarymanPrompt,
  getArtKitEntry,
  type ArtKitEntry,
} from "../lib/salaryman-art";
import { isOwnerEmail } from "../lib/plan";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isOwnerEmail(req.user.email)) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

// Track in-flight generation per key so we don't double-fire.
const inflight = new Set<string>();

/** Ensure the DB row for a kit entry exists; return current row. */
async function upsertAssetRow(entry: ArtKitEntry): Promise<ArtAsset> {
  const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, entry.key));
  if (existing) return existing;
  const [created] = await db.insert(artAssetsTable).values({
    key: entry.key,
    category: entry.category,
    subject: entry.subject,
    prompt: composeSalarymanPrompt(entry.subject),
    aspectRatio: entry.aspectRatio,
    status: "pending",
  }).returning();
  return created;
}

/** Kick off Nano Banana generation for an asset row. Updates the row with taskId. */
async function kickoff(asset: ArtAsset): Promise<ArtAsset> {
  if (!isNanoBananaConfigured()) return asset;
  if (inflight.has(asset.key)) return asset;
  inflight.add(asset.key);
  try {
    const taskId = await createImageTask({
      prompt: asset.prompt,
      aspectRatio: asset.aspectRatio as any,
      resolution: "1K",
      outputFormat: "jpg",
    });
    const [updated] = await db.update(artAssetsTable)
      .set({ taskId, status: "pending", failMsg: null, updatedAt: new Date() })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(`[art] kickoff failed for ${asset.key}: ${msg}`);
    const [updated] = await db.update(artAssetsTable)
      .set({ status: "failed", failMsg: msg.slice(0, 1000), updatedAt: new Date() })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  } finally {
    inflight.delete(asset.key);
  }
}

/** Poll apipass for a pending asset; promote to ready/failed when done. */
async function refreshIfPending(asset: ArtAsset): Promise<ArtAsset> {
  if (asset.status === "ready") return asset;
  if (!asset.taskId) return asset;
  try {
    const rec = await getTaskRecord(asset.taskId);
    const data = rec?.data ?? {};
    const state = String(data.state || "").toLowerCase();
    if (state === "success" || state === "completed" || state === "succeeded") {
      let url: string | null = null;
      try {
        const parsed = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
        url = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : null;
      } catch { /* ignore */ }
      if (url) {
        const [updated] = await db.update(artAssetsTable)
          .set({ url, status: "ready", failMsg: null, updatedAt: new Date() })
          .where(eq(artAssetsTable.id, asset.id))
          .returning();
        return updated || asset;
      }
    } else if (state === "fail" || state === "failed" || state === "error") {
      const [updated] = await db.update(artAssetsTable)
        .set({
          status: "failed",
          failMsg: String(data.failMsg || data.failCode || "apipass failure").slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(artAssetsTable.id, asset.id))
        .returning();
      return updated || asset;
    }
  } catch { /* ignore – will retry on next read */ }
  return asset;
}

/**
 * GET /api/art/asset/:key — main entry point. Returns the asset row.
 *  - If it doesn't exist yet, creates it from the kit + kicks off generation.
 *  - If it has a pending taskId, polls once and updates status if changed.
 *  - Always returns 200 with the latest row; clients render placeholder while pending.
 */
router.get("/art/asset/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "").slice(0, 80);

    // Look up the DB row first. This lets dynamic art (e.g. per-bot
    // portraits minted by /api/bots/:id/portrait) be polled through the
    // same /art/asset/:key endpoint without needing to live in the static
    // art kit. We only fall back to the kit when no row exists.
    const [existingRow] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
    if (existingRow) {
      let asset = existingRow;
      if (asset.status === "pending" && asset.taskId) {
        asset = await refreshIfPending(asset);
      } else if (!asset.url && !asset.taskId && asset.status !== "failed") {
        // Row exists but never kicked off (e.g. created with status=pending
        // by another path). Fire generation now.
        asset = await kickoff(asset);
      }
      res.json({ asset });
      return;
    }

    const entry = getArtKitEntry(key);
    if (!entry) { res.status(404).json({ error: "unknown asset key" }); return; }

    let asset = await upsertAssetRow(entry);
    if (!asset.url && !asset.taskId && asset.status !== "failed") {
      // Brand-new row, fire generation
      asset = await kickoff(asset);
    } else if (asset.status === "pending" && asset.taskId) {
      asset = await refreshIfPending(asset);
    }
    res.json({ asset });
  } catch (e: any) {
    console.error("[art] asset error", e);
    res.status(500).json({ error: e?.message || "Failed to load asset" });
  }
});

/** GET /api/art/library — list every kit asset (with current status). */
router.get("/art/library", async (_req: Request, res: Response) => {
  try {
    // Make sure rows exist for everything in the kit
    for (const entry of SALARYMAN_ART_KIT) {
      await upsertAssetRow(entry);
    }
    const rows = await db.select().from(artAssetsTable);
    // Opportunistically refresh up to 6 pending tasks per call
    let refreshed = 0;
    const out: ArtAsset[] = [];
    for (const r of rows) {
      if (refreshed < 6 && r.status === "pending" && r.taskId) {
        out.push(await refreshIfPending(r));
        refreshed++;
      } else {
        out.push(r);
      }
    }
    res.json({
      configured: isNanoBananaConfigured(),
      total: out.length,
      ready: out.filter(a => a.status === "ready").length,
      pending: out.filter(a => a.status === "pending").length,
      failed: out.filter(a => a.status === "failed").length,
      assets: out,
    });
  } catch (e: any) {
    console.error("[art] library error", e);
    res.status(500).json({ error: e?.message || "Failed to load library" });
  }
});

/** POST /api/art/asset/:key/regenerate — admin only, re-bake an asset. */
router.post("/art/asset/:key/regenerate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "").slice(0, 80);
    const entry = getArtKitEntry(key);
    if (!entry) { res.status(404).json({ error: "unknown asset key" }); return; }
    let asset = await upsertAssetRow(entry);
    // Always refresh prompt/subject in case the kit changed
    [asset] = await db.update(artAssetsTable)
      .set({
        subject: entry.subject,
        prompt: composeSalarymanPrompt(entry.subject),
        aspectRatio: entry.aspectRatio,
        status: "pending",
        url: null,
        taskId: null,
        failMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    asset = await kickoff(asset);
    res.json({ asset });
  } catch (e: any) {
    console.error("[art] regenerate error", e);
    res.status(500).json({ error: e?.message || "Failed to regenerate" });
  }
});

/** POST /api/art/seed — admin only, create rows + kickoff for every kit entry. */
router.post("/art/seed", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const out: { key: string; status: string }[] = [];
    for (const entry of SALARYMAN_ART_KIT) {
      let row = await upsertAssetRow(entry);
      if (!row.url && !row.taskId && row.status !== "failed") {
        row = await kickoff(row);
      }
      out.push({ key: row.key, status: row.status });
    }
    res.json({ seeded: out.length, results: out });
  } catch (e: any) {
    console.error("[art] seed error", e);
    res.status(500).json({ error: e?.message || "Failed to seed" });
  }
});

export default router;

/**
 * Background seeder — called once at server boot. Ensures every kit entry has
 * a row and kicks off generation for the first N missing assets so the game
 * doesn't have to wait on apipass for the bathroom scene to load.
 */
export async function seedSalarymanArtKit(maxKickoff = 8): Promise<void> {
  if (!isNanoBananaConfigured()) {
    console.log("[art] NANO_BANANA_API_KEY not set — skipping art kit seed");
    return;
  }
  let created = 0;
  let kickedOff = 0;
  for (const entry of SALARYMAN_ART_KIT) {
    try {
      const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, entry.key));
      let row: ArtAsset;
      if (!existing) {
        const [r] = await db.insert(artAssetsTable).values({
          key: entry.key,
          category: entry.category,
          subject: entry.subject,
          prompt: composeSalarymanPrompt(entry.subject),
          aspectRatio: entry.aspectRatio,
          status: "pending",
        }).returning();
        row = r;
        created++;
      } else {
        row = existing;
      }
      if (kickedOff < maxKickoff && !row.url && !row.taskId) {
        await kickoff(row);
        kickedOff++;
      }
    } catch (e: any) {
      console.warn(`[art] seed entry ${entry.key} failed: ${e?.message || e}`);
    }
  }
  console.log(`[art] Salaryman art kit seeded — ${SALARYMAN_ART_KIT.length} entries (${created} new, ${kickedOff} kickoffs)`);
}
