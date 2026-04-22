/**
 * Nano Banana (Google Gemini 2.5/3.1 Flash Image) via apipass.dev.
 *
 * Usage:
 *   const result = await generateImage({ prompt: "...", aspectRatio: "16:9" });
 *   // result.imageUrls is a list of CDN URLs to the generated images.
 *
 * The apipass API is async: createTask returns a taskId, and we poll
 * /api/v1/jobs/recordInfo until state is "completed" or "failed".
 */

const API_HOST = "https://api.apipass.dev";
const DEFAULT_MODEL = "google/nano-banana-2";
const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120_000;

export type AspectRatio =
  | "match_input_image" | "1:1" | "1:4" | "1:8" | "2:3" | "3:2"
  | "3:4" | "4:1" | "4:3" | "4:5" | "5:4" | "8:1"
  | "9:16" | "16:9" | "21:9";

export type Resolution = "1K" | "2K" | "4K";
export type OutputFormat = "jpg" | "png";

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

export async function createImageTask(opts: GenerateImageOptions): Promise<string> {
  const input: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.imageInput?.length) input.image_input = opts.imageInput;
  if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;
  if (opts.resolution) input.resolution = opts.resolution;
  if (opts.outputFormat) input.output_format = opts.outputFormat;
  if (typeof opts.googleSearch === "boolean") input.google_search = opts.googleSearch;
  if (typeof opts.imageSearch === "boolean") input.image_search = opts.imageSearch;

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
