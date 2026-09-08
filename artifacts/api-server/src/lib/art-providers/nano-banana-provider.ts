/**
 * Nano Banana provider — the ORIGINAL hosted backend, wrapped behind the
 * ArtProvider interface. This is the default backend for every art key and its
 * behavior is intentionally byte-identical to the pre-registry pipeline:
 *   - start()  → createImageTask({ prompt, aspectRatio, resolution:"2K", outputFormat:"png" })
 *   - poll()   → getTaskRecord(taskId), promote on success/fail, same parsing.
 *
 * Keeping this here (rather than inline in the route) is what lets other
 * providers slot in without changing how assets are generated or polled.
 */

import {
  createImageTask,
  getTaskRecord,
  isNanoBananaConfigured,
  nanoBananaHealthCheck,
  type AspectRatio,
} from "../nano-banana";
import type { ArtProvider, ArtGenRequest, ArtJobHandle, ArtJobStatus } from "./types";

export const NANO_BANANA_PROVIDER_ID = "nano-banana";

export const nanoBananaProvider: ArtProvider = {
  id: NANO_BANANA_PROVIDER_ID,
  label: "Nano Banana Pro",
  description:
    "Default hosted backend (google/nano-banana-pro via apipass). Fast, in-style; LANDSCAPE/PORTRAIT only.",

  isConfigured(): boolean {
    return isNanoBananaConfigured();
  },

  probe(): Promise<{ ok: boolean; error?: string }> {
    return nanoBananaHealthCheck();
  },

  async start(req: ArtGenRequest): Promise<ArtJobHandle> {
    const taskId = await createImageTask({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio as AspectRatio,
      resolution: "2K",
      outputFormat: "png",
    });
    return { taskId, meta: null };
  },

  async poll(handle: ArtJobHandle): Promise<ArtJobStatus> {
    if (!handle.taskId) return { state: "pending" };
    try {
      const rec = await getTaskRecord(handle.taskId);
      const data = rec?.data ?? {};
      const state = String(data.state || "").toLowerCase();
      if (state === "success" || state === "completed" || state === "succeeded") {
        let url: string | null = null;
        try {
          const parsed =
            typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
          url = Array.isArray(parsed?.resultUrls) ? parsed.resultUrls[0] : null;
        } catch {
          /* ignore */
        }
        if (url) return { state: "ready", url };
        // Completed but no URL extracted — keep pending; next poll may parse it.
        return { state: "pending" };
      }
      if (state === "fail" || state === "failed" || state === "error") {
        return {
          state: "failed",
          failMsg: String(data.failMsg || data.failCode || "apipass failure").slice(0, 1000),
        };
      }
    } catch {
      /* transient — retry on next read */
    }
    return { state: "pending" };
  },
};
