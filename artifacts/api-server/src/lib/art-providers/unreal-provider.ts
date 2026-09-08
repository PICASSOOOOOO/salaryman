/**
 * Cloud Unreal render-node provider — a REAL backend that renders SALARYMAN art
 * via Unreal Engine 5 on a cloud GPU (headless / Movie Render Queue).
 *
 * Replit cannot run Unreal (no GPU). This provider is the "brain": it submits a
 * render job to the configured remote node, polls it, and ingests the returned
 * public image/video URL(s). The GPU-side UE5 harness is stood up separately by
 * the devs and must implement the HTTP contract documented in ../unreal-render.ts
 * (and docs/unreal-render-node-contract.md).
 *
 * Config (requested via the environment-secrets flow):
 *   UNREAL_RENDER_URL  — base URL of the render node (required to be "configured")
 *   UNREAL_RENDER_KEY  — optional bearer token
 * When UNREAL_RENDER_URL is unset, isConfigured() is false → explicit Unreal
 * jobs fail clearly instead of silently changing renderer.
 *
 * JOB TYPES: object / landscape / cinematic (req.jobType). object & landscape
 * yield a single still; cinematic yields a video (or an encoded frame sequence),
 * ingested through the same poll → url path (mediaType flags it as video).
 *
 * NON-NEGOTIABLE STYLE CONSTRAINT — "all art must look synonymous":
 *   This provider submits `req.prompt` VERBATIM — that prompt is already the baked
 *   SALARYMAN style string (composeSalarymanPrompt), identical to what the hosted
 *   backends receive. Do NOT inject an Unreal-specific style here; mixing engines
 *   must never produce a mixed look. The optional polish pass equalizes fidelity.
 */

import {
  isUnrealConfigured,
  unrealSubmit,
  unrealPoll,
  unrealHealthCheck,
  toUnrealJobType,
  type UnrealJobType,
} from "../unreal-render";
import type { ArtProvider, ArtGenRequest, ArtJobHandle, ArtJobStatus } from "./types";

export const UNREAL_PROVIDER_ID = "unreal";

export const unrealProvider: ArtProvider = {
  id: UNREAL_PROVIDER_ID,
  label: "Unreal Render Node (UE5 / cloud GPU)",
  description:
    "Cloud Unreal Engine 5 render node (headless / Movie Render Queue). Renders objects, landscapes, and cinematics. Needs UNREAL_RENDER_URL.",

  isConfigured(): boolean {
    return isUnrealConfigured();
  },

  probe(): Promise<{ ok: boolean; error?: string }> {
    return unrealHealthCheck();
  },

  async start(req: ArtGenRequest): Promise<ArtJobHandle> {
    const jobType: UnrealJobType = toUnrealJobType(req.jobType);
    const submit = await unrealSubmit({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      jobType,
      key: req.key,
    });
    return {
      taskId: submit.jobId,
      // Persist the poll URL + job type so poll() works after a server restart
      // and can infer image-vs-video media type.
      meta: { statusUrl: submit.statusUrl ?? null, jobType },
    };
  },

  async poll(handle: ArtJobHandle): Promise<ArtJobStatus> {
    if (!handle.taskId) return { state: "pending" };
    const meta = handle.meta || {};
    const statusUrl = typeof meta.statusUrl === "string" ? meta.statusUrl : null;
    const jobType = toUnrealJobType(meta.jobType);
    const res = await unrealPoll({ jobId: handle.taskId, statusUrl, jobType });
    return {
      state: res.state,
      url: res.url ?? null,
      urls: res.urls,
      mediaType: res.mediaType,
      failMsg: res.failMsg ?? null,
    };
  },
};
