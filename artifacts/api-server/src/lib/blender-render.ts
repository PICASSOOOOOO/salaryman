/**
 * Blender headless render-node client.
 *
 * This deliberately mirrors the Unreal HTTP job contract so Blender can be
 * swapped in for repeatable props, buildings, characters, turntables, and
 * sprite sheets without changing the art route or the game client.
 *
 * Config:
 *   BLENDER_RENDER_URL — base URL of the Blender render node
 *   BLENDER_RENDER_KEY — optional bearer token
 */

const FETCH_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 4_000;

export type BlenderJobType = "object" | "landscape" | "cinematic";

export function isBlenderConfigured(): boolean {
  return Boolean(process.env.BLENDER_RENDER_URL);
}

function baseUrl(): string {
  const value = process.env.BLENDER_RENDER_URL;
  if (!value) throw new Error("BLENDER_RENDER_URL is not configured");
  return value.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const key = process.env.BLENDER_RENDER_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function jobType(value: unknown): BlenderJobType {
  return value === "landscape" || value === "cinematic" ? value : "object";
}

async function blenderFetch(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(path.startsWith("http") ? path : `${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...headers(), ...(init.headers || {}) },
    });
    const text = await response.text();
    let body: any;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) {
      const detail = body?.detail || body?.error || body?.message || response.statusText;
      throw new Error(`blender ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function blenderHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!isBlenderConfigured()) return { ok: false, error: "not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(baseUrl(), { signal: controller.signal, headers: headers() });
    if (!response.ok && response.status >= 500) return { ok: false, error: `blender ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export async function blenderSubmit(input: {
  prompt: string;
  aspectRatio: string;
  jobType?: BlenderJobType;
  key?: string;
}): Promise<{ jobId: string; statusUrl?: string | null }> {
  const body = await blenderFetch("/render", {
    method: "POST",
    body: JSON.stringify({
      engine: "blender",
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      jobType: jobType(input.jobType),
      key: input.key,
    }),
  });
  const id = body?.jobId || body?.job_id || body?.id;
  if (!id) throw new Error(`blender submit: missing jobId in response: ${JSON.stringify(body)}`);
  return { jobId: String(id), statusUrl: body?.statusUrl || body?.status_url || null };
}

function urls(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) out.push(value);
  };
  if (Array.isArray(payload.resultUrls)) payload.resultUrls.forEach(add);
  if (Array.isArray(payload.urls)) payload.urls.forEach(add);
  add(payload.imageUrl);
  add(payload.videoUrl);
  add(payload.url);
  return [...new Set(out)];
}

export async function blenderPoll(input: {
  jobId: string;
  statusUrl?: string | null;
  jobType?: BlenderJobType;
}): Promise<{ state: "pending" | "ready" | "failed"; url?: string; urls?: string[]; mediaType?: "image" | "video"; failMsg?: string }> {
  try {
    const body = await blenderFetch(input.statusUrl || `/render/${encodeURIComponent(input.jobId)}`);
    const state = String(body?.status || body?.state || "").toLowerCase();
    if (["completed", "complete", "success", "succeeded", "done"].includes(state)) {
      const resultUrls = urls(body);
      if (!resultUrls[0]) return { state: "failed", failMsg: "render completed without a result url" };
      const explicit = body?.mediaType === "video" || body?.mediaType === "image" ? body.mediaType : null;
      const mediaType = explicit || (input.jobType === "cinematic" ? "video" : "image");
      return { state: "ready", url: resultUrls[0], urls: resultUrls, mediaType };
    }
    if (["failed", "fail", "error"].includes(state)) {
      return { state: "failed", failMsg: String(body?.error || body?.failMsg || "render failed").slice(0, 1000) };
    }
    return { state: "pending" };
  } catch (error) {
    return { state: "pending", failMsg: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}