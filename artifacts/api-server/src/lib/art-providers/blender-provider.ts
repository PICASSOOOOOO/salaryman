import {
  blenderHealthCheck,
  blenderPoll,
  blenderSubmit,
  isBlenderConfigured,
  type BlenderJobType,
} from "../blender-render";
import type { ArtGenRequest, ArtJobHandle, ArtJobStatus, ArtProvider } from "./types";

export const BLENDER_PROVIDER_ID = "blender";

export const blenderProvider: ArtProvider = {
  id: BLENDER_PROVIDER_ID,
  label: "Blender Render Node",
  description:
    "Headless Blender renderer for deterministic props, buildings, characters, turntables, and sprite exports. Needs BLENDER_RENDER_URL.",

  isConfigured(): boolean {
    return isBlenderConfigured();
  },

  probe(): Promise<{ ok: boolean; error?: string }> {
    return blenderHealthCheck();
  },

  async start(req: ArtGenRequest): Promise<ArtJobHandle> {
    const submitted = await blenderSubmit({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      jobType: (req.jobType as BlenderJobType | undefined) ?? "object",
      key: req.key,
    });
    return {
      taskId: submitted.jobId,
      meta: { statusUrl: submitted.statusUrl ?? null, jobType: req.jobType ?? "object" },
    };
  },

  async poll(handle: ArtJobHandle): Promise<ArtJobStatus> {
    const meta = handle.meta || {};
    const result = await blenderPoll({
      jobId: handle.taskId,
      statusUrl: typeof meta.statusUrl === "string" ? meta.statusUrl : null,
      jobType: meta.jobType as BlenderJobType | undefined,
    });
    return {
      state: result.state,
      url: result.url ?? null,
      urls: result.urls,
      mediaType: result.mediaType,
      failMsg: result.failMsg ?? null,
    };
  },
};