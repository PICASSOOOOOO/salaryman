import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, artAssetsTable, type ArtAsset } from "@workspace/db";
import { isNanoBananaConfigured } from "../lib/nano-banana";
import {
  SALARYMAN_ART_KIT,
  composeSalarymanPrompt,
  getArtKitEntry,
  type ArtKitEntry,
} from "../lib/salaryman-art";
import {
  getProvider,
  listProviderSummaries,
  DEFAULT_PROVIDER_ID,
  type ArtJobHandle,
} from "../lib/art-providers";
import { runPolish, isPolishConfigured, isPolishOp } from "../lib/art-polish";
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

/** Parse the JSON poll-handle stashed on a row (fal queue URLs, etc.). */
function readHandleMeta(asset: ArtAsset): Record<string, unknown> | null {
  if (!asset.backendMeta) return null;
  try {
    const parsed = JSON.parse(asset.backendMeta);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

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

/**
 * Kick off generation for an asset row through its chosen backend provider.
 * Updates the row with the provider's job handle (taskId + backendMeta).
 */
async function kickoff(asset: ArtAsset): Promise<ArtAsset> {
  let provider = getProvider(asset.backend);
  // If the row's chosen backend isn't configured (e.g. "unreal" requested but
  // UNREAL_RENDER_URL is unset), transparently fall back to the default backend
  // so the asset still renders instead of getting stuck pending forever. Persist
  // the effective backend so polling and the admin UI stay consistent.
  if (!provider.isConfigured() && asset.backend !== DEFAULT_PROVIDER_ID) {
    const fallback = getProvider(DEFAULT_PROVIDER_ID);
    if (fallback.isConfigured()) {
      const [reassigned] = await db.update(artAssetsTable)
        .set({ backend: DEFAULT_PROVIDER_ID, updatedAt: new Date() })
        .where(eq(artAssetsTable.id, asset.id))
        .returning();
      asset = reassigned || { ...asset, backend: DEFAULT_PROVIDER_ID };
      provider = fallback;
    }
  }
  // No configured backend for this row — leave it untouched (the client renders
  // a placeholder). This keeps the pipeline from hard-failing when neither key
  // is set, matching the original Nano-Banana-not-configured behavior.
  if (!provider.isConfigured()) return asset;
  if (inflight.has(asset.key)) return asset;
  inflight.add(asset.key);
  try {
    const handle: ArtJobHandle = await provider.start({
      prompt: asset.prompt,
      aspectRatio: asset.aspectRatio,
      jobType: (asset.jobType as "object" | "landscape" | "cinematic" | null) ?? undefined,
      key: asset.key,
    });
    const [updated] = await db.update(artAssetsTable)
      .set({
        taskId: handle.taskId,
        backendMeta: handle.meta ? JSON.stringify(handle.meta) : null,
        status: "pending",
        failMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(`[art] kickoff failed for ${asset.key} (${provider.id}): ${msg}`);
    const [updated] = await db.update(artAssetsTable)
      .set({ status: "failed", failMsg: msg.slice(0, 1000), updatedAt: new Date() })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  } finally {
    inflight.delete(asset.key);
  }
}

/** Poll the asset's backend for a pending job; promote to ready/failed when done. */
async function refreshIfPending(asset: ArtAsset): Promise<ArtAsset> {
  if (asset.status === "ready") return asset;
  if (!asset.taskId) return asset;
  const provider = getProvider(asset.backend);
  const status = await provider.poll({ taskId: asset.taskId, meta: readHandleMeta(asset) });
  if (status.state === "ready" && status.url) {
    const [updated] = await db.update(artAssetsTable)
      .set({
        url: status.url,
        mediaType: status.mediaType === "video" ? "video" : "image",
        status: "ready",
        failMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  }
  if (status.state === "failed") {
    const [updated] = await db.update(artAssetsTable)
      .set({
        status: "failed",
        failMsg: String(status.failMsg || "generation failure").slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  }
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
      providers: listProviderSummaries(),
      polishConfigured: isPolishConfigured(),
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

/** GET /api/art/providers — admin only, list registered backends + config state. */
router.get("/art/providers", requireAdmin, async (_req: Request, res: Response) => {
  res.json({ providers: listProviderSummaries(), polishConfigured: isPolishConfigured() });
});

/**
 * POST /api/art/asset/:key/regenerate — admin only, re-bake an asset.
 * Optional body { backend } picks which registered provider renders it. Works on
 * both static kit keys and dynamic rows (e.g. bot portraits) that have no kit entry.
 */
router.post("/art/asset/:key/regenerate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "").slice(0, 80);
    const requestedBackend = typeof req.body?.backend === "string" ? req.body.backend : null;
    const backend = requestedBackend ? getProvider(requestedBackend).id : null;
    // Optional render-recipe hint (Unreal node only). Validate against the allowed
    // set; an explicit "object"/"landscape"/"cinematic" overrides, anything else
    // leaves the existing value untouched.
    const rawJobType = typeof req.body?.jobType === "string" ? req.body.jobType : null;
    const jobType: "object" | "landscape" | "cinematic" | null =
      rawJobType === "object" || rawJobType === "landscape" || rawJobType === "cinematic"
        ? rawJobType
        : null;

    const entry = getArtKitEntry(key);
    if (entry) {
      let asset = await upsertAssetRow(entry);
      // Always refresh prompt/subject in case the kit changed
      [asset] = await db.update(artAssetsTable)
        .set({
          subject: entry.subject,
          prompt: composeSalarymanPrompt(entry.subject),
          aspectRatio: entry.aspectRatio,
          backend: backend ?? asset.backend ?? DEFAULT_PROVIDER_ID,
          jobType: jobType ?? asset.jobType ?? null,
          // Re-baking always starts from a clean still; poll promotes to video.
          mediaType: "image",
          status: "pending",
          url: null,
          taskId: null,
          backendMeta: null,
          failMsg: null,
          updatedAt: new Date(),
        })
        .where(eq(artAssetsTable.id, asset.id))
        .returning();
      asset = await kickoff(asset);
      res.json({ asset });
      return;
    }

    // No kit entry — but the row may still exist (dynamic asset). Re-bake in place
    // using its stored prompt so admins can move it to a different backend.
    const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
    if (!existing) { res.status(404).json({ error: "unknown asset key" }); return; }
    let [asset] = await db.update(artAssetsTable)
      .set({
        backend: backend ?? existing.backend ?? DEFAULT_PROVIDER_ID,
        jobType: jobType ?? existing.jobType ?? null,
        mediaType: "image",
        status: "pending",
        url: null,
        taskId: null,
        backendMeta: null,
        failMsg: null,
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, existing.id))
      .returning();
    asset = await kickoff(asset);
    res.json({ asset });
  } catch (e: any) {
    console.error("[art] regenerate error", e);
    res.status(500).json({ error: e?.message || "Failed to regenerate" });
  }
});

/**
 * POST /api/art/asset/:key/polish — admin only. Run a post-process polish pass
 * (op: "upscale" | "remove_bg") on a finished asset and replace its URL.
 */
router.post("/art/asset/:key/polish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "").slice(0, 80);
    const op = req.body?.op;
    if (!isPolishOp(op)) { res.status(400).json({ error: "op must be 'upscale' or 'remove_bg'" }); return; }
    if (!isPolishConfigured()) {
      res.status(503).json({ error: "Polish pass not configured (FAL_KEY missing)", studioOutage: true });
      return;
    }
    const [asset] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
    if (!asset) { res.status(404).json({ error: "unknown asset key" }); return; }
    if (asset.status !== "ready" || !asset.url) {
      res.status(409).json({ error: "asset is not ready yet — nothing to polish" });
      return;
    }
    const newUrl = await runPolish(op, asset.url);
    const [updated] = await db.update(artAssetsTable)
      .set({ url: newUrl, updatedAt: new Date() })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    res.json({ asset: updated || asset, op });
  } catch (e: any) {
    console.error("[art] polish error", e);
    res.status(500).json({ error: e?.message || "Failed to polish" });
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
