/**
 * Optional post-process "polish" pass for a finished art asset.
 *
 * Image operations run on an already-generated public image URL and return a
 * new public URL that replaces the asset's URL:
 *   - "upscale"    — super-resolution for crisper, higher-res art.
 *   - "remove_bg"  — background removal (Bria RMBG) → transparent PNG cutout,
 *                    useful for sprites/props the game draws over the world.
 *
 * Video assets (cinematic Unreal jobs return video, not stills) get their own
 * enhancement op so they reach the same fidelity-parity bar instead of being
 * left as-is:
 *   - "enhance"    — video super-resolution (Topaz-style) → crisper, higher-res
 *                    clip; replaces the asset's video URL.
 *
 * Provider note: Replit's managed-billing fal proxy DOES expose Bria
 * background-removal, but only from the agent code-execution sandbox — it is not
 * reachable from this server runtime. So every operation calls fal directly with
 * FAL_KEY (the "keyed call" fallback). If FAL_KEY is absent the polish pass
 * reports not-configured and the asset is left untouched.
 */

import {
  isFalConfigured,
  runFalJob,
  falSubmit,
  falPoll,
  falUpscaleModel,
  falBgRemoveModel,
  falVideoUpscaleModel,
  type FalPollResult,
} from "./fal";

export type PolishOp = "upscale" | "remove_bg";
export type VideoPolishOp = "enhance";

export function isPolishConfigured(): boolean {
  return isFalConfigured();
}

export function isPolishOp(op: unknown): op is PolishOp {
  return op === "upscale" || op === "remove_bg";
}

export function isVideoPolishOp(op: unknown): op is VideoPolishOp {
  return op === "enhance";
}

/**
 * Run an image polish operation against an image URL. Returns the new public URL.
 * Throws if not configured or the upstream job fails.
 */
export async function runPolish(op: PolishOp, imageUrl: string): Promise<string> {
  if (!isFalConfigured()) throw new Error("Polish pass not configured (FAL_KEY missing)");
  if (!imageUrl) throw new Error("No source image URL to polish");

  if (op === "upscale") {
    return runFalJob(falUpscaleModel(), { image_url: imageUrl });
  }
  // remove_bg
  return runFalJob(falBgRemoveModel(), { image_url: imageUrl });
}

/**
 * Opaque poll handle for an in-flight async video enhancement job. Persisted on
 * the asset row so the enhanced clip can be swapped in by a later poll (no
 * long-held HTTP request).
 */
export interface VideoPolishHandle {
  op: VideoPolishOp;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  model: string;
}

/**
 * Kick off an async video enhancement job (video super-resolution). Returns a
 * poll handle immediately instead of blocking for the (multi-minute) render.
 * Throws on submit failure or when not configured.
 */
export async function startVideoPolish(
  op: VideoPolishOp,
  videoUrl: string,
): Promise<VideoPolishHandle> {
  if (!isFalConfigured()) throw new Error("Polish pass not configured (FAL_KEY missing)");
  if (!videoUrl) throw new Error("No source video URL to enhance");

  const model = falVideoUpscaleModel();
  const submit = await falSubmit(model, { video_url: videoUrl });
  return {
    op,
    requestId: submit.requestId,
    statusUrl: submit.statusUrl,
    responseUrl: submit.responseUrl,
    model,
  };
}

/**
 * Poll a previously-started video enhancement job once. Never throws for
 * transient errors (returns "pending"); surfaces account outages as "failed".
 */
export async function pollVideoPolish(handle: {
  statusUrl: string;
  responseUrl: string;
}): Promise<FalPollResult> {
  return falPoll({ statusUrl: handle.statusUrl, responseUrl: handle.responseUrl }, "video");
}
