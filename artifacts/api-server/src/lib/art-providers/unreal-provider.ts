/**
 * Unreal render-node provider — FUTURE / STUB (intentionally inert).
 *
 * This is the seat reserved for a self-hosted Unreal Engine 5 render node running
 * on a local Mac mini (or any GPU box). Unreal cannot run on Replit (no GPU, not
 * a hosted API), so this provider is NOT implemented — it exists only to prove the
 * pluggability story: when the local node is online, it drops in here without
 * touching the art pipeline or the game's consumption side.
 *
 * Intended shape once implemented:
 *   - Config:  UNREAL_RENDER_NODE_URL (+ optional UNREAL_RENDER_NODE_TOKEN).
 *   - start(): POST {url}/render { prompt, aspectRatio } -> { jobId } (the remote
 *              node enqueues a Pixel-Streaming / offline render job).
 *   - poll():  GET {url}/render/{jobId} -> { status, imageUrl } and ingest the
 *              returned public image URL exactly like the hosted providers.
 *
 * Until then isConfigured() is false (so the registry never routes to it) and
 * start()/poll() throw a clear "not implemented" error if called directly.
 *
 * PRODUCT VISION (why this seat exists):
 *   The Unreal node is meant to mint high-fidelity 3D-derived assets that fold
 *   back into the live city — feeding the customizable property templates and the
 *   debtor / in-game-dev / tester construction-labor pipeline (see the
 *   land-construction system + debt-collection facility) so the city can be
 *   developed live and uniquely, and so players can eventually drop these new
 *   objects into their own builds.
 *
 * NON-NEGOTIABLE STYLE CONSTRAINT — "all art must look synonymous":
 *   Every backend (Nano Banana, fal.ai, this node) renders from the SAME baked
 *   SALARYMAN style prompt (composeSalarymanPrompt), and the optional polish pass
 *   (upscale / bg-remove) is the equalizer that keeps fidelity consistent when
 *   engines are mixed. An Unreal implementation MUST honor the same style prompt
 *   (and/or run the polish pass) so its output is indistinguishable in style from
 *   the hosted backends — mixing engines must never produce a mixed look.
 */

import type { ArtProvider, ArtGenRequest, ArtJobHandle, ArtJobStatus } from "./types";

export const UNREAL_PROVIDER_ID = "unreal";

const NOT_IMPLEMENTED =
  "Unreal render node is a future self-hosted backend and is not implemented yet.";

export const unrealProvider: ArtProvider = {
  id: UNREAL_PROVIDER_ID,
  label: "Unreal Render Node (future)",
  description:
    "Reserved for a self-hosted Unreal Engine render node (local Mac mini). Inert stub — not implemented.",

  isConfigured(): boolean {
    // Even if the env var were set, this provider is a stub. Keep it inert so the
    // pipeline never routes real jobs here until it is actually built.
    return false;
  },

  async start(_req: ArtGenRequest): Promise<ArtJobHandle> {
    throw new Error(NOT_IMPLEMENTED);
  },

  async poll(_handle: ArtJobHandle): Promise<ArtJobStatus> {
    return { state: "failed", failMsg: NOT_IMPLEMENTED };
  },
};
