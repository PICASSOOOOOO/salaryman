/**
 * fal.ai queue client — direct API access via a FAL_KEY secret, mirroring the
 * pattern in nano-banana.ts (async submit + poll, timeouts, outage classify).
 *
 * Why direct (not the Replit managed-billing fal proxy)? The managed proxy
 * currently only exposes Bria background-removal (see the external_apis fal
 * reference) and is only reachable from the agent code-execution sandbox, not
 * from this server runtime. To unlock the real fidelity jump (FLUX image
 * generation, upscalers) the server calls fal's public queue API with FAL_KEY,
 * exactly as nano-banana.ts uses NANO_BANANA_API_KEY.
 *
 * Queue lifecycle (https://docs.fal.ai/model-endpoints/queue):
 *   POST  https://queue.fal.run/{model}            -> { request_id, status_url, response_url }
 *   GET   {status_url}                             -> { status: IN_QUEUE|IN_PROGRESS|COMPLETED }
 *   GET   {response_url}                           -> model output (e.g. { images:[{url}] })
 *
 * If FAL_KEY is absent every call throws "FAL_KEY is not configured"; callers
 * must gate on isFalConfigured() so the pipeline degrades gracefully.
 */

const QUEUE_HOST = "https://queue.fal.run";
const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2000;
const FETCH_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 4000; // Reachability probe must never block the admin page.

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

function getKey(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY is not configured");
  return k;
}

/** Default flagship text-to-image model; override with FAL_IMAGE_MODEL. */
export function falImageModel(): string {
  return process.env.FAL_IMAGE_MODEL || "fal-ai/flux/dev";
}
/** Default upscaler model; override with FAL_UPSCALE_MODEL. */
export function falUpscaleModel(): string {
  return process.env.FAL_UPSCALE_MODEL || "fal-ai/esrgan";
}
/** Background-removal model (Bria RMBG); override with FAL_BG_REMOVE_MODEL. */
export function falBgRemoveModel(): string {
  return process.env.FAL_BG_REMOVE_MODEL || "fal-ai/bria/background/remove";
}
/** Default video super-resolution model; override with FAL_VIDEO_UPSCALE_MODEL. */
export function falVideoUpscaleModel(): string {
  return process.env.FAL_VIDEO_UPSCALE_MODEL || "fal-ai/topaz/upscale/video";
}

async function falFetch(input: string, init: RequestInit = {}): Promise<any> {
  const url = input.startsWith("http") ? input : `${QUEUE_HOST}${input}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Key ${getKey()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const detail = body?.detail || body?.message || res.statusText;
    throw new Error(
      `fal ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
  return body;
}

/**
 * Classify an account-level fal OUTAGE (no balance / rate limit / upstream down)
 * vs a caller-input problem. Mirrors nano-banana's isImageServiceOutage so the
 * polish/generation routes can surface a calm "studio outage" message.
 */
export function isFalOutage(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : err == null ? "" : String(err);
  if (!msg) return false;
  if (/\bfal\b[^]*\b(402|403|429|500|502|503|504)\b/.test(msg)) return true;
  if (
    /insufficient[\s_-]?balance|out of credit|no credit|exhausted|quota|rate[\s_-]?limit|temporarily unavailable|service unavailable/i.test(
      msg,
    )
  )
    return true;
  return false;
}

/**
 * Lightweight reachability probe for fal.ai. Never throws. Used by the admin Art
 * Library to show the backend online/offline without submitting a job. A quick
 * GET to the queue host with a short timeout. A non-2xx status is synthesized
 * into the same `fal <status>: …` string falFetch throws and run through
 * isFalOutage so classification stays consistent: an outage-class status
 * (402/403/429/5xx) => offline, while any other response (e.g. a 404) still
 * proves reachability => online. A network/abort error means offline.
 */
export async function falHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!isFalConfigured()) return { ok: false, error: "not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(QUEUE_HOST, {
      method: "GET",
      signal: controller.signal,
      headers: { Authorization: `Key ${getKey()}` },
    });
    if (!res.ok) {
      const err = `fal ${res.status}: ${res.statusText}`;
      if (isFalOutage(err)) return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e?.message || String(e)).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export interface FalSubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

/** Submit a job to a fal queue model. Returns the request handle (async). */
export async function falSubmit(model: string, input: Record<string, unknown>): Promise<FalSubmitResult> {
  const body = await falFetch(`/${model}`, { method: "POST", body: JSON.stringify(input) });
  const requestId = body?.request_id;
  if (!requestId) throw new Error(`fal submit: missing request_id in response: ${JSON.stringify(body)}`);
  // fal returns absolute status/response URLs; fall back to reconstruction.
  const statusUrl = body?.status_url || `${QUEUE_HOST}/${model}/requests/${requestId}/status`;
  const responseUrl = body?.response_url || `${QUEUE_HOST}/${model}/requests/${requestId}`;
  return { requestId, statusUrl, responseUrl };
}

export type FalState = "pending" | "ready" | "failed";

export interface FalPollResult {
  state: FalState;
  url?: string | null;
  failMsg?: string | null;
  raw?: any;
}

/** Pull the first image URL out of a fal model output payload. */
export function extractFalImageUrl(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  // Common shapes: { images:[{url}] }, { image:{url} }, { image_url }, { url }
  if (Array.isArray(output.images) && output.images[0]?.url) return String(output.images[0].url);
  if (output.image?.url) return String(output.image.url);
  if (typeof output.image_url === "string") return output.image_url;
  if (typeof output.url === "string") return output.url;
  // Last resort: walk for any image-looking URL.
  let found: string | null = null;
  const visit = (v: any): void => {
    if (found || !v) return;
    if (typeof v === "string" && /^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(v)) {
      found = v;
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === "object") {
      for (const k of Object.keys(v)) visit(v[k]);
    }
  };
  visit(output);
  return found;
}

/** Pull the first video URL out of a fal model output payload. */
export function extractFalVideoUrl(output: any): string | null {
  if (!output || typeof output !== "object") return null;
  // Common shapes: { video:{url} }, { videos:[{url}] }, { video_url }, { url }
  if (output.video?.url) return String(output.video.url);
  if (Array.isArray(output.videos) && output.videos[0]?.url) return String(output.videos[0].url);
  if (typeof output.video_url === "string") return output.video_url;
  if (typeof output.url === "string" && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(output.url)) return output.url;
  // Last resort: walk for any video-looking URL.
  let found: string | null = null;
  const visit = (v: any): void => {
    if (found || !v) return;
    if (typeof v === "string" && /^https?:\/\/.+\.(mp4|webm|mov|m4v)(\?|$)/i.test(v)) {
      found = v;
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === "object") {
      for (const k of Object.keys(v)) visit(v[k]);
    }
  };
  visit(output);
  return found;
}

/** Poll a previously-submitted fal job (one check). `kind` selects the output extractor. */
export async function falPoll(
  handle: { statusUrl: string; responseUrl: string },
  kind: "image" | "video" = "image",
): Promise<FalPollResult> {
  try {
    const st = await falFetch(handle.statusUrl);
    const status = String(st?.status || "").toUpperCase();
    if (status === "COMPLETED") {
      const out = await falFetch(handle.responseUrl);
      const url = kind === "video" ? extractFalVideoUrl(out) : extractFalImageUrl(out);
      if (url) return { state: "ready", url, raw: out };
      return { state: "failed", failMsg: `fal completed without a ${kind} url`, raw: out };
    }
    if (status === "FAILED" || status === "ERROR") {
      return { state: "failed", failMsg: String(st?.error || "fal job failed").slice(0, 1000), raw: st };
    }
    // IN_QUEUE / IN_PROGRESS
    return { state: "pending", raw: st };
  } catch (e: any) {
    // A genuine account outage should surface, not silently retry forever.
    if (isFalOutage(e)) return { state: "failed", failMsg: (e?.message || String(e)).slice(0, 1000) };
    return { state: "pending" };
  }
}

/**
 * Submit + block until a fal job resolves (used by the synchronous polish pass).
 * Returns the final image URL or throws on failure/timeout.
 */
export async function runFalJob(
  model: string,
  input: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  kind: "image" | "video" = "image",
): Promise<string> {
  const handle = await falSubmit(model, input);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await falPoll(handle, kind);
    if (res.state === "ready" && res.url) return res.url;
    if (res.state === "failed") throw new Error(res.failMsg || "fal job failed");
  }
  throw new Error("fal job timed out");
}

/** Map a legacy "W:H" ratio string to a fal image_size preset. */
export function toFalImageSize(ratio: string | undefined): string {
  if (!ratio) return "square_hd";
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (!m) return "square_hd";
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (!w || !h) return "square_hd";
  if (w === h) return "square_hd";
  return w > h ? "landscape_16_9" : "portrait_16_9";
}
