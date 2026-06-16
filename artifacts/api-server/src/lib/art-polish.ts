/**
 * Optional post-process "polish" pass for a finished art asset.
 *
 * Two operations, both run on an already-generated public image URL and return a
 * new public URL that replaces the asset's URL:
 *   - "upscale"    — super-resolution for crisper, higher-res art.
 *   - "remove_bg"  — background removal (Bria RMBG) → transparent PNG cutout,
 *                    useful for sprites/props the game draws over the world.
 *
 * Provider note: Replit's managed-billing fal proxy DOES expose Bria
 * background-removal, but only from the agent code-execution sandbox — it is not
 * reachable from this server runtime. So both operations call fal directly with
 * FAL_KEY (the "keyed call" fallback). If FAL_KEY is absent the polish pass
 * reports not-configured and the asset is left untouched.
 */

import { isFalConfigured, runFalJob, falUpscaleModel, falBgRemoveModel } from "./fal";

export type PolishOp = "upscale" | "remove_bg";

export function isPolishConfigured(): boolean {
  return isFalConfigured();
}

export function isPolishOp(op: unknown): op is PolishOp {
  return op === "upscale" || op === "remove_bg";
}

/**
 * Run a polish operation against an image URL. Returns the new public URL.
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
