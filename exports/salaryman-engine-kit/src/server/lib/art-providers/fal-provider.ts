/**
 * fal.ai provider — the flagship HIGH-FIDELITY hosted backend.
 *
 * Generates with a FLUX-class model (FAL_IMAGE_MODEL, default fal-ai/flux/dev)
 * for visibly higher polish than the default Nano Banana backend. Async submit +
 * poll through fal's queue API; the queue status/response URLs are stashed in the
 * job handle's `meta` so poll() works after a server restart.
 *
 * Gated on FAL_KEY: when the key is absent isConfigured() is false and the
 * pipeline never routes a job here, so everything keeps working on Nano Banana.
 *
 * STYLE CONSISTENCY: this provider renders `req.prompt` verbatim — that prompt is
 * already the baked SALARYMAN style string (composeSalarymanPrompt), identical to
 * what Nano Banana receives. Keeping engines on one shared style prompt is what
 * makes a mixed-engine library still look synonymous; the polish pass equalizes
 * fidelity on top. Do NOT inject a fal-specific style here.
 */

import {
  isFalConfigured,
  falSubmit,
  falPoll,
  falImageModel,
  falHealthCheck,
  toFalImageSize,
} from "../fal";
import type { ArtProvider, ArtGenRequest, ArtJobHandle, ArtJobStatus } from "./types";

export const FAL_PROVIDER_ID = "fal";

export const falProvider: ArtProvider = {
  id: FAL_PROVIDER_ID,
  label: "fal.ai (FLUX)",
  description:
    "Flagship hosted backend (FLUX via fal.ai). Higher fidelity / detail than the default. Needs FAL_KEY.",

  isConfigured(): boolean {
    return isFalConfigured();
  },

  probe(): Promise<{ ok: boolean; error?: string }> {
    return falHealthCheck();
  },

  async start(req: ArtGenRequest): Promise<ArtJobHandle> {
    const model = falImageModel();
    const submit = await falSubmit(model, {
      prompt: req.prompt,
      image_size: toFalImageSize(req.aspectRatio),
      num_images: 1,
      enable_safety_checker: true,
    });
    return {
      taskId: submit.requestId,
      meta: { statusUrl: submit.statusUrl, responseUrl: submit.responseUrl, model },
    };
  },

  async poll(handle: ArtJobHandle): Promise<ArtJobStatus> {
    const meta = handle.meta || {};
    const statusUrl = typeof meta.statusUrl === "string" ? meta.statusUrl : null;
    const responseUrl = typeof meta.responseUrl === "string" ? meta.responseUrl : null;
    if (!statusUrl || !responseUrl) return { state: "pending" };
    const res = await falPoll({ statusUrl, responseUrl });
    return { state: res.state, url: res.url ?? null, failMsg: res.failMsg ?? null };
  },
};
