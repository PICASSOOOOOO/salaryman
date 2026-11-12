/**
 * Nano Banana Pro (google/nano-banana-pro) via apipass.dev.
 *
 * Usage:
 *   const result = await generateImage({ prompt: "...", aspectRatio: "16:9" });
 *   // result.imageUrls is a list of CDN URLs to the generated images.
 *
 * Pro API only accepts aspect_ratio: 'LANDSCAPE' | 'PORTRAIT'. We accept
 * any legacy ratio string (e.g. "16:9", "1:1", "4:3") and map it down.
 *
 * The apipass API is async: createTask returns a taskId, and we poll
 * /api/v1/jobs/recordInfo until state is "completed" or "failed".
 */

const API_HOST = "https://api.apipass.dev";
const DEFAULT_MODEL = "google/nano-banana-pro";
const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 4000; // Reachability probe must never block the admin page.

// Legacy ratio strings accepted from callers; mapped to LANDSCAPE/PORTRAIT for Pro.
export type AspectRatio =
  | "match_input_image" | "1:1" | "1:4" | "1:8" | "2:3" | "3:2"
  | "3:4" | "4:1" | "4:3" | "4:5" | "5:4" | "8:1"
  | "9:16" | "16:9" | "21:9"
  | "LANDSCAPE" | "PORTRAIT";

export type ProAspectRatio = "LANDSCAPE" | "PORTRAIT";

export type Resolution = "1K" | "2K" | "4K";
export type OutputFormat = "jpg" | "png";

function toProAspect(r: AspectRatio | undefined): ProAspectRatio {
  if (r === "LANDSCAPE" || r === "PORTRAIT") return r;
  if (!r) return "LANDSCAPE";
  // Parse "W:H" — width >= height ⇒ LANDSCAPE, else PORTRAIT.
  const m = /^(\d+):(\d+)$/.exec(r);
  if (m) {
    const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
    if (w && h) return w >= h ? "LANDSCAPE" : "PORTRAIT";
  }
  return "LANDSCAPE";
}

export interface GenerateImageOptions {
  prompt: string;
  imageInput?: string[];           // Up to 14 reference URLs
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  outputFormat?: OutputFormat;
  googleSearch?: boolean;
  imageSearch?: boolean;
  model?: string;                  // Override default (e.g. "google/nano-banana-2")
  timeoutMs?: number;
  callBackUrl?: string;
}

export interface GenerateImageResult {
  taskId: string;
  state: "completed" | "failed" | "timeout";
  imageUrls: string[];
  raw: any;
  failCode?: string | null;
  failMsg?: string | null;
  costTimeMs: number;
}

function getKey(): string {
  const k = process.env.NANO_BANANA_API_KEY;
  if (!k) throw new Error("NANO_BANANA_API_KEY is not configured");
  return k;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_HOST}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const detail = body?.detail || body?.message || res.statusText;
    throw new Error(`apipass ${path} ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return body;
}

/**
 * Classify whether an image-generation failure is an ACCOUNT-LEVEL service
 * outage (the apipass credit pool is depleted / the upstream is unavailable)
 * rather than a problem with the caller's input. Used so callers can surface a
 * clear "temporary studio outage, not your photo" message instead of a generic
 * error. Accepts either a thrown Error/message string (from createTask, where
 * apiFetch throws `apipass <path> <status>: <detail>`) or a failMsg from a
 * failed task record.
 */
export function isImageServiceOutage(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message :
    typeof err === "string" ? err :
    err == null ? "" : String(err);
  if (!msg) return false;
  // apipass wraps HTTP failures as `apipass <path> <status>: <detail>`. A 402
  // (no credit), 429 (rate/quota) or 5xx (upstream down) on that call is an
  // account/service problem, not the user's photo.
  if (/\bapipass\b[^]*\b(402|429|500|502|503|504)\b/.test(msg)) return true;
  // Text signatures that show up regardless of the status wrapper.
  if (/insufficient[\s_-]?credit|out of credit|no credit|not enough credit|quota|rate[\s_-]?limit|temporarily unavailable|service unavailable/i.test(msg)) return true;
  return false;
}

/**
 * Lightweight reachability probe for apipass. Never throws. Used by the admin Art
 * Library to show the backend online/offline without creating a task. A quick GET
 * to the API host with a short timeout. A non-2xx status is synthesized into the
 * same `apipass <path> <status>: …` string apiFetch throws and run through
 * isImageServiceOutage so classification stays consistent: an outage-class status
 * (402/429/5xx) => offline, while any other response (e.g. a 404) still proves
 * reachability => online. A network/abort error means offline.
 */
export async function nanoBananaHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!isNanoBananaConfigured()) return { ok: false, error: "not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(API_HOST, {
      method: "GET",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${getKey()}` },
    });
    if (!res.ok) {
      const err = `apipass / ${res.status}: ${res.statusText}`;
      if (isImageServiceOutage(err)) return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e?.message || String(e)).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export async function createImageTask(opts: GenerateImageOptions): Promise<string> {
  const input: Record<string, unknown> = { prompt: opts.prompt };
  // Pro API: aspect_ratio is REQUIRED and must be 'LANDSCAPE' | 'PORTRAIT'.
  input.aspect_ratio = toProAspect(opts.aspectRatio);
  // Pro API: reference images go in `images` (not `image_input`).
  if (opts.imageInput?.length) input.images = opts.imageInput;

  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    input,
  };
  if (opts.callBackUrl) body.callBackUrl = opts.callBackUrl;

  const res = await apiFetch("/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = res?.data?.taskId;
  if (!taskId) throw new Error(`apipass createTask: missing taskId in response: ${JSON.stringify(res)}`);
  return taskId;
}

export async function getTaskRecord(taskId: string): Promise<any> {
  return apiFetch(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
}

function extractImageUrls(resultJson: any): string[] {
  if (!resultJson) return [];
  // apipass returns resultJson as a STRING (JSON-encoded). Parse if so.
  let parsed: any = resultJson;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (typeof parsed !== "object" || parsed === null) return [];

  // Preferred shape: { resultUrls: [...] }
  if (Array.isArray(parsed.resultUrls)) {
    return parsed.resultUrls.filter((u: unknown): u is string => typeof u === "string");
  }

  // Fallback: walk object for any image-looking URLs
  const out: string[] = [];
  const visit = (v: any): void => {
    if (!v) return;
    if (typeof v === "string" && /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(v)) {
      out.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === "object") {
      for (const key of Object.keys(v)) visit((v as any)[key]);
    }
  };
  visit(parsed);
  return Array.from(new Set(out));
}

export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const taskId = await createImageTask(opts);

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const rec = await getTaskRecord(taskId);
    const data = rec?.data ?? {};
    const state = String(data.state || "").toLowerCase();

    if (state === "success" || state === "completed" || state === "succeeded") {
      const imageUrls = extractImageUrls(data.resultJson);
      return {
        taskId,
        state: "completed",
        imageUrls,
        raw: data,
        costTimeMs: Date.now() - start,
      };
    }
    if (state === "fail" || state === "failed" || state === "error") {
      return {
        taskId,
        state: "failed",
        imageUrls: [],
        raw: data,
        failCode: data.failCode,
        failMsg: data.failMsg,
        costTimeMs: Date.now() - start,
      };
    }
    // states: waiting, queuing, generating — keep polling
  }

  // Timed out — caller can poll later by taskId
  return {
    taskId,
    state: "timeout",
    imageUrls: [],
    raw: null,
    costTimeMs: Date.now() - start,
  };
}

export function isNanoBananaConfigured(): boolean {
  return Boolean(process.env.NANO_BANANA_API_KEY);
}
