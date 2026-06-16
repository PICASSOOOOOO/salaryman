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
  listProviderSummariesWithHealth,
  DEFAULT_PROVIDER_ID,
  type ArtJobHandle,
  type ArtProvider,
} from "../lib/art-providers";
import {
  runPolish,
  runVideoPolish,
  isPolishConfigured,
  isPolishOp,
  isVideoPolishOp,
} from "../lib/art-polish";
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

/**
 * Like kickoff(), but pins the job to a SPECIFIC provider with NO fallback to the
 * default backend. Used by the test-render flow, whose whole point is to confirm
 * the *selected* backend works — silently re-routing to Nano Banana would defeat
 * the test. Assumes the provider is configured (caller checks).
 */
async function kickoffWithProvider(asset: ArtAsset, provider: ArtProvider): Promise<ArtAsset> {
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
    console.warn(`[art] test kickoff failed for ${asset.key} (${provider.id}): ${msg}`);
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
    // Exclude throwaway smoke-test rows (POST /art/test-render) from the grid so
    // they don't pollute the kit; the Test Render panel polls them individually.
    const rows = (await db.select().from(artAssetsTable))
      .filter(r => r.category !== TEST_RENDER_CATEGORY);
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
      providers: await listProviderSummariesWithHealth(),
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
  res.json({ providers: await listProviderSummariesWithHealth(), polishConfigured: isPolishConfigured() });
});

/**
 * The three smoke-test jobs fired by POST /api/art/test-render. One object, one
 * landscape, one cinematic — the exact acceptance check from the Unreal task, made
 * repeatable for any backend. Subjects are generic (style is baked by the kit
 * prompt) so the test only proves the backend ingests end-to-end, not art quality.
 */
const TEST_RENDER_JOBS: {
  jobType: "object" | "landscape" | "cinematic";
  subject: string;
  aspectRatio: string;
}[] = [
  { jobType: "object", subject: "a single ceramic coffee mug on a plain surface, centered product shot", aspectRatio: "1:1" },
  { jobType: "landscape", subject: "a wide neon-noir city skyline at dusk", aspectRatio: "16:9" },
  { jobType: "cinematic", subject: "a slow cinematic pan across a rain-soaked neon street at night", aspectRatio: "16:9" },
];

/** Category used for the throwaway smoke-test rows (filtered out of the library). */
const TEST_RENDER_CATEGORY = "__test__";

/** Stable key for a test render so re-running reuses the row instead of piling up. */
function testRenderKey(backend: string, jobType: string): string {
  return `__test__/${backend}/${jobType}`.slice(0, 80);
}

/**
 * POST /api/art/test-render — admin only. Fire a one-click smoke test (object,
 * landscape, cinematic) against a chosen backend so the owner can confirm a newly
 * connected render node actually produces art end-to-end. Body { backend } picks
 * which registered provider to test (defaults to the default backend). If the
 * backend isn't configured, returns 200 with configured:false and no jobs — the
 * UI shows it clearly instead of silently falling back to Nano Banana.
 */
router.post("/art/test-render", requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestedBackend = typeof req.body?.backend === "string" ? req.body.backend : null;
    const provider = getProvider(requestedBackend);
    if (!provider.isConfigured()) {
      res.json({ backend: provider.id, configured: false, jobs: [] });
      return;
    }

    const jobs: { key: string; jobType: string; asset: ArtAsset }[] = [];
    for (const job of TEST_RENDER_JOBS) {
      const key = testRenderKey(provider.id, job.jobType);
      const prompt = composeSalarymanPrompt(job.subject);
      const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
      let asset: ArtAsset;
      if (existing) {
        [asset] = await db.update(artAssetsTable)
          .set({
            category: TEST_RENDER_CATEGORY,
            subject: job.subject,
            prompt,
            aspectRatio: job.aspectRatio,
            backend: provider.id,
            jobType: job.jobType,
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
      } else {
        [asset] = await db.insert(artAssetsTable).values({
          key,
          category: TEST_RENDER_CATEGORY,
          subject: job.subject,
          prompt,
          aspectRatio: job.aspectRatio,
          backend: provider.id,
          jobType: job.jobType,
          status: "pending",
        }).returning();
      }
      asset = await kickoffWithProvider(asset, provider);
      jobs.push({ key, jobType: job.jobType, asset });
    }

    res.json({ backend: provider.id, configured: true, jobs });
  } catch (e: any) {
    console.error("[art] test-render error", e);
    res.status(500).json({ error: e?.message || "Failed to start test render" });
  }
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
 * POST /api/art/asset/:key/polish — admin only. Run a post-process enhancement
 * pass on a finished asset and replace its URL.
 *  - Image assets accept op "upscale" | "remove_bg".
 *  - Video assets (cinematic renders) accept op "enhance" — a video
 *    super-resolution pass so clips reach the same fidelity bar as stills.
 */
router.post("/art/asset/:key/polish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "").slice(0, 80);
    const op = req.body?.op;
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
    let newUrl: string;
    if (asset.mediaType === "video") {
      if (!isVideoPolishOp(op)) {
        res.status(400).json({ error: "video assets only support op 'enhance'" });
        return;
      }
      newUrl = await runVideoPolish(op, asset.url);
    } else {
      if (!isPolishOp(op)) {
        res.status(400).json({ error: "op must be 'upscale' or 'remove_bg'" });
        return;
      }
      newUrl = await runPolish(op, asset.url);
    }
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
