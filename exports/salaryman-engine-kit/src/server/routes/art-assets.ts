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
  listProviderSummariesWithHealthNonBlocking,
  clearProviderHealthCache,
  DEFAULT_PROVIDER_ID,
  type ArtJobHandle,
  type ArtProvider,
} from "../lib/art-providers";
import {
  runPolish,
  startVideoPolish,
  pollVideoPolish,
  isPolishConfigured,
  isPolishOp,
  isVideoPolishOp,
  type VideoPolishOp,
} from "../lib/art-polish";
import { isFalOutage } from "../lib/fal";
import { getArtQaRecipe, validateArtOutput, type ArtQaResult } from "../lib/art-qa";
import { isOwnerEmail } from "../lib/plan";
import { generateArtDirectionBrief } from "../lib/art-direction";
import { listArtFamilies } from "../lib/art-families";
import {
  deliverIncidentReport,
  incidentChannelsConfigured,
  claimIncidentReport,
  releaseIncidentReport,
  INCIDENT_REPORT_MAX_CHARS,
  INCIDENT_DEDUP_WINDOW_MS,
  ALL_INCIDENT_CHANNELS,
  type IncidentChannel,
} from "../lib/incident-channel";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isOwnerEmail(req.user.email)) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

/** GET /api/art/families — owner-only production asset-family matrix. */
router.get("/art/families", requireAdmin, (_req: Request, res: Response) => {
  res.json({ families: listArtFamilies() });
});

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

function readQa(asset: ArtAsset): ArtQaResult | null {
  const meta = readHandleMeta(asset);
  const qa = meta?.qa;
  return qa && typeof qa === "object" ? qa as ArtQaResult : null;
}

async function writeQa(asset: ArtAsset, qa: ArtQaResult): Promise<ArtAsset> {
  const meta = readHandleMeta(asset) || {};
  meta.qa = qa;
  const [updated] = await db.update(artAssetsTable)
    .set({ backendMeta: JSON.stringify(meta), updatedAt: new Date() })
    .where(eq(artAssetsTable.id, asset.id))
    .returning();
  return updated || asset;
}

/**
 * In-flight (or just-finished-failed) async video-enhancement job, stashed under
 * `polish` inside the row's backendMeta JSON so the enhanced clip can be swapped
 * in by a later poll without holding the HTTP request open. Kept separate from
 * the generation poll-handle keys (statusUrl/responseUrl/model) at the top level.
 */
interface PolishJob {
  op: VideoPolishOp;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  model: string;
  startedAt: number;
  state: "processing" | "failed";
  error?: string;
}

// Async video super-resolution can take several minutes; if a job is still
// processing past this we surface a clear timeout instead of spinning forever.
const POLISH_TIMEOUT_MS = 900_000; // 15 min

function readPolishJob(asset: ArtAsset): PolishJob | null {
  const meta = readHandleMeta(asset);
  const p = meta?.polish;
  if (!p || typeof p !== "object") return null;
  return p as PolishJob;
}

/** Persist (or clear when null) the polish job on a row, preserving other meta. */
async function writePolishJob(asset: ArtAsset, polish: PolishJob | null): Promise<ArtAsset> {
  const meta = readHandleMeta(asset) || {};
  if (polish) meta.polish = polish;
  else delete meta.polish;
  const hasKeys = Object.keys(meta).length > 0;
  const [updated] = await db.update(artAssetsTable)
    .set({ backendMeta: hasKeys ? JSON.stringify(meta) : null, updatedAt: new Date() })
    .where(eq(artAssetsTable.id, asset.id))
    .returning();
  return updated || asset;
}

/** Map a row's stored polish job into the client-facing view (or null). */
function polishView(asset: ArtAsset): {
  state: "processing" | "failed";
  op: string;
  error: string | null;
  startedAt: number;
} | null {
  const job = readPolishJob(asset);
  if (!job) return null;
  return { state: job.state, op: job.op, error: job.error ?? null, startedAt: job.startedAt };
}

/** Attach the derived `polish` view to a row for the JSON response. */
function withPolishView(asset: ArtAsset): ArtAsset & {
  polish: ReturnType<typeof polishView>;
  qa: ArtQaResult | null;
} {
  return { ...asset, polish: polishView(asset), qa: readQa(asset) };
}

/**
 * Poll an in-flight video-enhancement job. When ready, swap the asset's URL to
 * the enhanced clip and clear the job. On failure (or timeout) record a clear,
 * friendly message but leave the original clip in place. No-op when no job is
 * processing, so this is cheap to call on every read.
 */
async function refreshPolishIfPending(asset: ArtAsset): Promise<ArtAsset> {
  const job = readPolishJob(asset);
  if (!job || job.state !== "processing") return asset;

  if (Date.now() - job.startedAt > POLISH_TIMEOUT_MS) {
    return writePolishJob(asset, {
      ...job,
      state: "failed",
      error: "Enhancement timed out — the studio is taking too long. Please try again.",
    });
  }

  const res = await pollVideoPolish({ statusUrl: job.statusUrl, responseUrl: job.responseUrl });
  if (res.state === "ready" && res.url) {
    const cleared = await writePolishJob(asset, null);
    const [updated] = await db.update(artAssetsTable)
      .set({ url: res.url, updatedAt: new Date() })
      .where(eq(artAssetsTable.id, cleared.id))
      .returning();
    return updated || cleared;
  }
  if (res.state === "failed") {
    const raw = res.failMsg || "video enhancement failed";
    const error = isFalOutage(raw)
      ? "The enhancement studio is temporarily unavailable. Please try again shortly."
      : String(raw).slice(0, 300);
    return writePolishJob(asset, { ...job, state: "failed", error });
  }
  return asset; // still processing
}

/** Ensure the DB row for a kit entry exists; return current row. */
async function upsertAssetRow(entry: ArtKitEntry): Promise<ArtAsset> {
  const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, entry.key));
  if (existing) return existing;
  const [created] = await db.insert(artAssetsTable).values({
    key: entry.key,
    category: entry.category,
    subject: entry.subject,
    // A kit entry may supply a fully-composed prompt (e.g. realistic character
    // templates opting out of the pixel SALARYMAN_STYLE); otherwise compose the
    // default styled prompt from the subject.
    prompt: entry.fullPrompt ?? composeSalarymanPrompt(entry.subject),
    aspectRatio: entry.aspectRatio,
    // Honor the kit's preferred backend/job-type when set. Explicit renderer
    // selection is preserved and kickoff fails clearly if that backend is not
    // configured; unset = default backend.
    ...(entry.backend ? { backend: entry.backend } : {}),
    ...(entry.jobType ? { jobType: entry.jobType } : {}),
    status: "pending",
  }).returning();
  return created;
}

/**
 * How long to wait before re-attempting generation for a `failed` asset that
 * gets polled again. Keeps a still-broken backend from being hammered on every
 * request while still letting a transiently-failed asset (e.g. the art backend
 * was briefly out of credit) recover on its own once it's healthy.
 */
export const FAILED_RETRY_COOLDOWN_MS = 3 * 60 * 1000;

/** Whether a failed asset is eligible for a fresh self-heal generation attempt. */
export function shouldRetryFailedAsset(asset: ArtAsset): boolean {
  if (asset.status !== "failed") return false;
  if (asset.url) return false;
  const last = asset.updatedAt instanceof Date ? asset.updatedAt.getTime() : Date.parse(String(asset.updatedAt ?? 0));
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= FAILED_RETRY_COOLDOWN_MS;
}

/**
 * Kick off generation for an asset row through its chosen backend provider.
 * Updates the row with the provider's job handle (taskId + backendMeta).
 */
async function kickoff(asset: ArtAsset): Promise<ArtAsset> {
  const provider = getProvider(asset.backend);
  if (!provider.isConfigured()) {
    const msg = `${provider.label} is not configured; refusing to silently switch renderers`;
    const [updated] = await db.update(artAssetsTable)
      .set({ status: "failed", failMsg: msg, updatedAt: new Date() })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return updated || asset;
  }
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
    const recipe = getArtQaRecipe(asset.category, asset.aspectRatio, status.mediaType === "video" ? "video" : "image");
    const qa = await validateArtOutput(status.url, recipe, status.mediaType === "video" ? "video" : "image");
    const qaStatus = qa.state === "failed" ? "failed" : qa.state === "needs_review" ? "needs_review" : "ready";
    const [updated] = await db.update(artAssetsTable)
      .set({
        url: status.url,
        mediaType: status.mediaType === "video" ? "video" : "image",
        status: qaStatus,
        failMsg: qa.failures.length ? qa.failures.join("; ").slice(0, 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    return writeQa(updated || asset, qa);
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
      } else if (asset.status === "failed" && shouldRetryFailedAsset(asset)) {
        // Self-heal: a previously-failed asset (e.g. the backend was briefly
        // out of credit / unreachable when it first baked) gets one fresh
        // generation attempt when it's polled again after a cooldown, instead
        // of staying permanently blank. Cooldown-gated so a still-broken
        // backend isn't hammered on every poll.
        asset = await kickoff(asset);
      }
      // Poll any in-flight video-enhancement job and swap in the enhanced clip.
      asset = await refreshPolishIfPending(asset);
      res.json({ asset: withPolishView(asset) });
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
    asset = await refreshPolishIfPending(asset);
    res.json({ asset: withPolishView(asset) });
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
    const allRows = await db.select().from(artAssetsTable);
    const testRenderCount = allRows.filter(r => r.category === TEST_RENDER_CATEGORY).length;
    const rows = allRows.filter(r => r.category !== TEST_RENDER_CATEGORY);
    // Opportunistically refresh up to 6 pending tasks per call
    let refreshed = 0;
    const out: ArtAsset[] = [];
    for (const r of rows) {
      let row = r;
      if (refreshed < 6 && row.status === "pending" && row.taskId) {
        row = await refreshIfPending(row);
        refreshed++;
      }
      // Cheap no-op unless an in-flight video enhancement is running on this row.
      row = await refreshPolishIfPending(row);
      out.push(row);
    }
    res.json({
      configured: isNanoBananaConfigured(),
      providers: listProviderSummariesWithHealthNonBlocking(),
      polishConfigured: isPolishConfigured(),
      incidentChannels: incidentChannelsConfigured(),
      total: out.length,
      ready: out.filter(a => a.status === "ready").length,
      pending: out.filter(a => a.status === "pending").length,
      failed: out.filter(a => a.status === "failed").length,
      needsReview: out.filter(a => a.status === "needs_review").length,
      testRenderCount,
      assets: out.map(withPolishView),
    });
  } catch (e: any) {
    console.error("[art] library error", e);
    res.status(500).json({ error: e?.message || "Failed to load library" });
  }
});

/** POST /api/art/direction/brief — owner-only Astra production planning. */
router.post("/art/direction/brief", requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 400) : "";
    if (!focus) {
      res.status(400).json({ error: "focus is required" });
      return;
    }
    const assetTypes = Array.isArray(body.assetTypes)
      ? body.assetTypes.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 12)
      : [];
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : undefined;
    const count = typeof body.count === "number" && Number.isFinite(body.count) ? body.count : undefined;
    const brief = await generateArtDirectionBrief({ focus, assetTypes, notes, count });
    res.json({ brief });
  } catch (error) {
    console.error("[art] direction brief error", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to generate art-direction brief" });
  }
});

/** POST /api/art/asset/:key/approve — admin-only human acceptance after QA. */
router.post("/art/asset/:key/approve", requireAdmin, async (req: Request, res: Response) => {
  const key = String(req.params.key || "").slice(0, 80);
  const [asset] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, key));
  if (!asset) { res.status(404).json({ error: "unknown asset key" }); return; }
  if (!asset.url) { res.status(409).json({ error: "asset has no rendered output" }); return; }
  if (readQa(asset)?.state === "failed") {
    res.status(409).json({ error: "asset failed technical QA and must be regenerated" });
    return;
  }
  const [updated] = await db.update(artAssetsTable)
    .set({ status: "ready", failMsg: null, updatedAt: new Date() })
    .where(eq(artAssetsTable.id, asset.id))
    .returning();
  res.json({ asset: withPolishView(updated || asset) });
});

/**
 * GET /api/art/providers — admin only, list registered backends + config state.
 *
 * ?fresh=1 (or fresh=true) clears the provider health cache before probing and
 * blocks on a live probe, so an admin who just brought a backend online can
 * confirm it immediately instead of waiting out the ~20s cache window.
 *
 * The default load path (no flag) is non-blocking: it returns cached results
 * immediately, or reports "checking" while a background probe runs, so the page
 * never stalls on the first load after the cache expires.
 */
router.get("/art/providers", requireAdmin, async (req: Request, res: Response) => {
  if (req.query.fresh === "1" || req.query.fresh === "true") {
    clearProviderHealthCache();
    res.json({ providers: await listProviderSummariesWithHealth(), polishConfigured: isPolishConfigured() });
    return;
  }
  res.json({ providers: listProviderSummariesWithHealthNonBlocking(), polishConfigured: isPolishConfigured() });
});

/**
 * POST /api/art/incident-report — admin only. Push the ready-made downtime
 * report (the exact text the "Copy all" button builds via buildAllHistoryCopyText
 * on the client) to the shared on-call incident channel(s) so the team sees it
 * without a manual paste. Body: { text }. Returns which channels delivered. If no
 * incident channel is configured at all, returns 503 so the UI can say so.
 */
router.post("/art/incident-report", requireAdmin, async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Missing report text" });
    return;
  }
  if (text.length > INCIDENT_REPORT_MAX_CHARS) {
    res.status(413).json({ error: "Report too large" });
    return;
  }
  // Optional destination filter: an admin can pick e.g. Discord only. Absent =>
  // every channel (the prior all-channels behaviour). Reject a present-but-empty
  // or all-garbage selection so a typo can't silently broadcast everywhere.
  let channels: IncidentChannel[] | undefined;
  if (req.body?.channels !== undefined) {
    if (!Array.isArray(req.body.channels)) {
      res.status(400).json({ error: "channels must be an array" });
      return;
    }
    const valid = (req.body.channels as unknown[]).filter(
      (c: unknown): c is IncidentChannel => c === "discord" || c === "email",
    );
    const deduped: IncidentChannel[] = Array.from(new Set(valid));
    if (deduped.length === 0) {
      res.status(400).json({ error: "No valid channels selected" });
      return;
    }
    channels = deduped;
  }
  // Guard on the SELECTED channels, not all of them, so "Discord only" with no
  // webhook set still returns the helpful 503 instead of silently no-op'ing.
  const config = incidentChannelsConfigured();
  const selected = channels ?? ALL_INCIDENT_CHANNELS;
  const configuredSelected = selected.filter((c) => config[c]);
  if (configuredSelected.length === 0) {
    res.status(503).json({
      error: "No incident channel configured",
      hint: "Set INCIDENT_DISCORD_WEBHOOK_URL (or DISCORD_WEBHOOK_URL) and/or ART_BACKEND_ALERT_EMAIL.",
    });
    return;
  }
  // Coalesce rapid duplicates (double-clicks, two admins reacting at once) so the
  // same downtime report isn't re-broadcast to a channel that just received it.
  // Dedup is PER-CHANNEL: claiming only the configured+selected channels means a
  // "retry failed only" send is fresh for the channels that previously failed
  // while a channel that already delivered stays deduped. Claimed up-front so
  // concurrent sends race-safely.
  const claim = claimIncidentReport(text, configuredSelected);
  if (claim.fresh.length === 0) {
    // Every configured+selected channel already received this exact report.
    res.status(409).json({
      ok: false,
      deduped: true,
      error: "This report was already sent moments ago",
      // Echo the channels this duplicate targeted (the resolved selection, so an
      // absent filter reports every channel) so the UI can name the collision and
      // distinguish a per-channel cooldown from a different destination.
      channels: selected,
      sentAgoMs: claim.sentAgoMs,
      windowMs: INCIDENT_DEDUP_WINDOW_MS,
    });
    return;
  }
  // Deliver to the freshly-claimed channels PLUS any selected-but-unconfigured
  // channels (so they're still reported as `skipped`). Channels deduped as recent
  // duplicates are dropped so they aren't re-broadcast.
  const unconfiguredSelected = selected.filter((c) => !config[c]);
  const result = await deliverIncidentReport(text, [...claim.fresh, ...unconfiguredSelected]);
  // Release claims for any channel that didn't actually deliver so a genuine
  // retry of just those channels isn't blocked. Delivered channels keep their
  // claim to coalesce rapid duplicates.
  if (result.failed.length > 0) releaseIncidentReport(text, result.failed);
  if (result.delivered.length === 0) {
    res.status(502).json({ error: "Failed to deliver report", ...result });
    return;
  }
  res.json({ ok: true, ...result });
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
 * DELETE /api/art/test-render — admin only. Wipe every throwaway smoke-test row
 * (category "__test__") so the owner can tidy up after confirming a backend works.
 * The main library grid already filters this category out, so the visible library
 * is unaffected; this just clears the stable per-backend test rows and their
 * orphaned CDN URLs. Returns { deleted } so the UI can report the count.
 */
router.delete("/art/test-render", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const deleted = await db
      .delete(artAssetsTable)
      .where(eq(artAssetsTable.category, TEST_RENDER_CATEGORY))
      .returning({ id: artAssetsTable.id });
    res.json({ deleted: deleted.length });
  } catch (e: any) {
    console.error("[art] clear test-render error", e);
    res.status(500).json({ error: e?.message || "Failed to clear test results" });
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
          prompt: entry.fullPrompt ?? composeSalarymanPrompt(entry.subject),
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
    if (asset.mediaType === "video") {
      if (!isVideoPolishOp(op)) {
        res.status(400).json({ error: "video assets only support op 'enhance'" });
        return;
      }
      // Video super-resolution can take several minutes. Kick off the fal job
      // asynchronously and return immediately with a "processing" state; the
      // GET routes poll it and swap in the enhanced clip when ready. This avoids
      // a long-held HTTP request that could feel like a hang or time out.
      const running = readPolishJob(asset);
      if (running && running.state === "processing") {
        res.status(409).json({ error: "An enhancement is already running for this clip." });
        return;
      }
      let handle;
      try {
        handle = await startVideoPolish(op, asset.url);
      } catch (e: any) {
        const outage = isFalOutage(e);
        res.status(outage ? 503 : 500).json({
          error: outage
            ? "The enhancement studio is temporarily unavailable. Please try again shortly."
            : e?.message || "Failed to start enhancement",
          studioOutage: outage,
        });
        return;
      }
      const updated = await writePolishJob(asset, {
        op,
        requestId: handle.requestId,
        statusUrl: handle.statusUrl,
        responseUrl: handle.responseUrl,
        model: handle.model,
        startedAt: Date.now(),
        state: "processing",
      });
      res.json({ asset: withPolishView(updated), op });
      return;
    }

    // Image ops are fast — keep them synchronous.
    if (!isPolishOp(op)) {
      res.status(400).json({ error: "op must be 'upscale' or 'remove_bg'" });
      return;
    }
    const newUrl = await runPolish(op, asset.url);
    const meta = readHandleMeta(asset) || {};
    const sourceUrl = typeof meta.sourceUrl === "string" ? meta.sourceUrl : asset.url;
    const history = Array.isArray(meta.polishHistory) ? meta.polishHistory : [];
    meta.sourceUrl = sourceUrl;
    meta.polishHistory = [
      { op, fromUrl: asset.url, toUrl: newUrl, appliedAt: new Date().toISOString() },
      ...history,
    ].slice(0, 8);
    const qa = await validateArtOutput(
      newUrl,
      getArtQaRecipe(asset.category, asset.aspectRatio, asset.mediaType || "image"),
      asset.mediaType || "image",
    );
    meta.qa = qa;
    const qaStatus = qa.state === "failed" ? "failed" : qa.state === "needs_review" ? "needs_review" : "ready";
    const [updated] = await db.update(artAssetsTable)
      .set({
        url: newUrl,
        status: qaStatus,
        failMsg: qa.failures.length ? qa.failures.join("; ").slice(0, 1000) : null,
        backendMeta: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(artAssetsTable.id, asset.id))
      .returning();
    res.json({ asset: withPolishView(updated || asset), op });
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

/**
 * POST /api/art/bake-portraits — admin only. Force-bake (or boot-bake) all 9
 * realistic character-template portraits that gate the intake identity gallery.
 *
 * Body: { force?: boolean }
 *   force=false (default / boot): kick off only rows that have never been started
 *     (no url AND no taskId). Already-pending or already-ready rows are skipped.
 *   force=true (admin re-bake): reset EVERY un-baked row regardless of prior taskId
 *     / failMsg and fire a fresh generation — useful after topping up apipass credit
 *     or configuring UNREAL_RENDER_URL.
 *
 * Already-ready rows (url present) are never clobbered in either mode.
 */
router.post("/art/bake-portraits", requireAdmin, async (req: Request, res: Response) => {
  try {
    const force = req.body?.force === true;
    const result = await bakeCharacterPortraits(force);
    res.json(result);
  } catch (e: any) {
    console.error("[art] bake-portraits error", e);
    res.status(500).json({ error: e?.message || "Failed to bake portraits" });
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
      const desiredPrompt = entry.fullPrompt ?? composeSalarymanPrompt(entry.subject);
      const [existing] = await db.select().from(artAssetsTable).where(eq(artAssetsTable.key, entry.key));
      let row: ArtAsset;
      // Honor the kit's preferred backend/job-type (e.g. realistic character
      // templates route to the Unreal node). Mirror upsertAssetRow: only override
      // when the entry sets them, else fall to the schema default. kickoff() falls
      // back to the default backend automatically when the chosen one isn't configured.
      const desiredBackend = entry.backend ?? DEFAULT_PROVIDER_ID;
      const desiredJobType = entry.jobType ?? null;
      if (!existing) {
        const [r] = await db.insert(artAssetsTable).values({
          key: entry.key,
          category: entry.category,
          subject: entry.subject,
          prompt: desiredPrompt,
          aspectRatio: entry.aspectRatio,
          ...(entry.backend ? { backend: entry.backend } : {}),
          ...(entry.jobType ? { jobType: entry.jobType } : {}),
          status: "pending",
        }).returning();
        row = r;
        created++;
      } else if (
        !existing.url &&
        (existing.prompt !== desiredPrompt ||
          existing.backend !== desiredBackend ||
          (existing.jobType ?? null) !== desiredJobType)
      ) {
        // Row exists but never successfully baked and its stored prompt/backend/
        // job-type is stale (e.g. seeded before this entry gained a realistic
        // `fullPrompt` or its Unreal backend). Refresh and reset so the next
        // kickoff renders with the right style on the right backend. Rows that
        // already produced an image are left untouched.
        const [r] = await db.update(artAssetsTable)
          .set({
            subject: entry.subject,
            prompt: desiredPrompt,
            backend: desiredBackend,
            jobType: desiredJobType,
            status: "pending",
            taskId: null,
            failMsg: null,
          })
          .where(eq(artAssetsTable.key, entry.key))
          .returning();
        row = r;
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

/**
 * Bake the 9 realistic character-template portraits that gate the intake
 * identity gallery. Separated from seedSalarymanArtKit so portraits always
 * get their own kickoff budget regardless of how many other kit entries are
 * ahead of them in the array.
 *
 * force=false (boot path): kick off rows that have never been started
 *   (no url AND no taskId). Rows in "pending" with an in-flight taskId are
 *   left alone (already baking). Rows that previously failed but never got a
 *   taskId (immediate kickoff error) are re-tried.
 * force=true (admin "re-bake after credit top-up"): reset every un-baked row
 *   — clearing taskId, failMsg, and status — then kick them all off fresh.
 *   Already-ready rows (url set) are never clobbered in either mode.
 */
export async function bakeCharacterPortraits(force = false): Promise<{
  kicked: number;
  ready: number;
  results: { key: string; status: string }[];
}> {
  const charTemplateEntries = SALARYMAN_ART_KIT.filter(e =>
    e.key.startsWith("char_template_"),
  );
  const portraitProviderConfigured = charTemplateEntries.some((entry) =>
    getProvider(entry.backend ?? DEFAULT_PROVIDER_ID).isConfigured(),
  );
  if (!portraitProviderConfigured) {
    console.log("[art] No configured portrait renderer — skipping portrait bake");
    return { kicked: 0, ready: 0, results: [] };
  }
  let kicked = 0;
  let ready = 0;
  const results: { key: string; status: string }[] = [];

  for (const entry of charTemplateEntries) {
    try {
      let asset = await upsertAssetRow(entry);

      if (asset.url) {
        // Already baked — leave it untouched in both modes.
        ready++;
        results.push({ key: asset.key, status: asset.status });
        continue;
      }

      if (force) {
        // Admin force-bake: reset the row so a fresh generation is fired even
        // if a previous attempt left a stale taskId or failMsg behind.
        const desiredPrompt = entry.fullPrompt ?? composeSalarymanPrompt(entry.subject);
        [asset] = await db
          .update(artAssetsTable)
          .set({
            subject: entry.subject,
            prompt: desiredPrompt,
            aspectRatio: entry.aspectRatio,
            backend: entry.backend ?? DEFAULT_PROVIDER_ID,
            jobType: entry.jobType ?? null,
            status: "pending",
            taskId: null,
            backendMeta: null,
            failMsg: null,
            updatedAt: new Date(),
          })
          .where(eq(artAssetsTable.id, asset.id))
          .returning();
        asset = await kickoff(asset);
        kicked++;
      } else if (!asset.taskId) {
        // Boot path: kick off rows that were never started (covers both
        // brand-new rows and rows whose last kickoff failed immediately, since
        // immediate failures leave taskId=null).
        asset = await kickoff(asset);
        kicked++;
      }

      results.push({ key: asset.key, status: asset.status });
    } catch (e: any) {
      console.warn(`[art] portrait bake ${entry.key}: ${e?.message ?? e}`);
      results.push({ key: entry.key, status: "error" });
    }
  }

  console.log(
    `[art] Character portrait bake — ${charTemplateEntries.length} templates, ` +
    `${ready} already ready, ${kicked} kicked off`,
  );
  return { kicked, ready, results };
}
