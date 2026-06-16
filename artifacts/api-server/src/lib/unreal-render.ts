/**
 * Cloud Unreal render-node client — direct HTTP access to a self-hosted Unreal
 * Engine 5 render harness running on a cloud GPU instance. Mirrors the pattern in
 * fal.ts / nano-banana.ts (async submit + poll, per-request timeouts, account
 * outage classification) so the art pipeline treats it like any other backend.
 *
 * WHY a remote node: Replit has no GPU and cannot run Unreal Engine. Replit owns
 * the "brain" — it submits render jobs, polls their status, and ingests the
 * resulting public asset URL(s). The actual UE5 + Movie Render Queue automation
 * lives on a GPU box the devs stand up; this client just speaks its HTTP contract.
 *
 * Connection config (requested via the environment-secrets flow):
 *   UNREAL_RENDER_URL  — base URL of the render node (e.g. https://render.example.com)
 *   UNREAL_RENDER_KEY  — optional bearer token sent as `Authorization: Bearer …`
 *
 * When UNREAL_RENDER_URL is absent every call throws "UNREAL_RENDER_URL is not
 * configured"; callers gate on isUnrealConfigured() so the pipeline degrades to
 * the default backend with no hard failure.
 *
 * ── HTTP contract the cloud Unreal harness MUST implement ───────────────────
 *   Auth:    Authorization: Bearer <UNREAL_RENDER_KEY>  (only when a key is set)
 *
 *   Submit:  POST {UNREAL_RENDER_URL}/render
 *            body: { prompt, aspectRatio, jobType, key? }
 *              - prompt:     baked SALARYMAN style string (render verbatim — do
 *                            NOT add a node-specific style, see style constraint)
 *              - aspectRatio:legacy "W:H" string ("16:9","1:1","3:4", …)
 *              - jobType:    "object" | "landscape" | "cinematic"
 *              - key:        the art-asset key (for the node's own logging only)
 *            response: { jobId } (aliases accepted: job_id, id) and optionally
 *                      { statusUrl } to override the poll URL.
 *
 *   Poll:    GET {UNREAL_RENDER_URL}/render/{jobId}
 *            response: {
 *              status: "queued"|"rendering"|"completed"|"failed" (aliases: state,
 *                       success/succeeded → completed, error/fail → failed),
 *              resultUrls: ["https://…/out.png"]  (aliases: imageUrl, videoUrl,
 *                          url; a single string is also accepted),
 *              mediaType: "image" | "video"       (optional; inferred otherwise),
 *              error: "…"                          (only when failed)
 *            }
 *
 *   Result URL format: a PUBLIC https URL the game can load directly — png/jpg/
 *   webp for object/landscape jobs, mp4/webm for cinematic. For a frame sequence
 *   the node should encode to a single video and return that URL; multiple URLs
 *   are also accepted (the first is used as the primary asset URL).
 */

const DEFAULT_TIMEOUT_MS = 600_000; // Unreal renders are slow; allow up to 10m.
const POLL_INTERVAL_MS = 4000;
const FETCH_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 4000; // Reachability probe must never block the admin page.

export type UnrealJobType = "object" | "landscape" | "cinematic";
export type UnrealMediaType = "image" | "video";

export function isUnrealConfigured(): boolean {
  return Boolean(process.env.UNREAL_RENDER_URL);
}

/** Base URL of the render node, trailing slash stripped. Throws if unset. */
function getBaseUrl(): string {
  const u = process.env.UNREAL_RENDER_URL;
  if (!u) throw new Error("UNREAL_RENDER_URL is not configured");
  return u.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const key = process.env.UNREAL_RENDER_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Coerce an arbitrary value into one of the three supported job types. */
export function toUnrealJobType(v: unknown): UnrealJobType {
  return v === "landscape" || v === "cinematic" ? v : "object";
}

async function unrealFetch(path: string, init: RequestInit = {}): Promise<any> {
  const url = path.startsWith("http") ? path : `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
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
    const detail = body?.detail || body?.error || body?.message || res.statusText;
    throw new Error(
      `unreal ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
  }
  return body;
}

/**
 * Classify a render-node OUTAGE (node down / overloaded / GPU unavailable) vs a
 * caller-input problem, mirroring nano-banana's isImageServiceOutage and fal's
 * isFalOutage so callers can surface a calm "render node offline" message.
 */
export function isUnrealOutage(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : err == null ? "" : String(err);
  if (!msg) return false;
  // unrealFetch wraps HTTP failures as `unreal <status>: <detail>`. A 402/429/5xx
  // (or a network abort) is a node/service problem, not the prompt.
  if (/\bunreal\b[^]*\b(402|429|500|502|503|504)\b/.test(msg)) return true;
  if (
    /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)\b|abort|network|temporarily unavailable|service unavailable|gpu (?:busy|unavailable)|node (?:offline|busy)|overloaded|rate[\s_-]?limit/i.test(
      msg,
    )
  )
    return true;
  return false;
}

/**
 * Lightweight reachability probe for the render node. Never throws. Used by the
 * admin Art Library to show node online/offline WITHOUT submitting a render.
 *
 * It does a quick GET to the node base URL with a short timeout. A non-2xx
 * status is synthesized into the same `unreal <status>: …` string unrealFetch
 * throws and run through isUnrealOutage so classification stays consistent: an
 * outage-class status (402/429/5xx) => offline, while any other response (e.g. a
 * 404 route miss) still proves the node is reachable => online. A network/abort
 * error means the node is unreachable => offline.
 */
export async function unrealHealthCheck(): Promise<{ ok: boolean; error?: string }> {
  if (!isUnrealConfigured()) return { ok: false, error: "not configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(getBaseUrl(), {
      method: "GET",
      signal: controller.signal,
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = `unreal ${res.status}: ${res.statusText}`;
      // Only an outage-class status means down; other non-2xx still proves reach.
      if (isUnrealOutage(err)) return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e: any) {
    // A network/abort error means the node is unreachable.
    return { ok: false, error: (e?.message || String(e)).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export interface UnrealSubmitResult {
  jobId: string;
  /** Optional override poll URL the node returned (else we GET /render/{jobId}). */
  statusUrl?: string | null;
}

export interface UnrealSubmitInput {
  prompt: string;
  aspectRatio: string;
  jobType?: UnrealJobType;
  /** Asset key, forwarded to the node for its own logging. */
  key?: string;
}

/** Submit a render job to the node. Returns the job handle (async). */
export async function unrealSubmit(input: UnrealSubmitInput): Promise<UnrealSubmitResult> {
  const body = await unrealFetch("/render", {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      jobType: toUnrealJobType(input.jobType),
      key: input.key,
    }),
  });
  const jobId = body?.jobId || body?.job_id || body?.id;
  if (!jobId) throw new Error(`unreal submit: missing jobId in response: ${JSON.stringify(body)}`);
  return { jobId: String(jobId), statusUrl: body?.statusUrl || body?.status_url || null };
}

export type UnrealState = "pending" | "ready" | "failed";

export interface UnrealPollResult {
  state: UnrealState;
  /** Primary public URL once ready (first of `urls`). */
  url?: string | null;
  /** All result URLs (a cinematic may be a single video; sequences are encoded). */
  urls?: string[];
  mediaType?: UnrealMediaType;
  failMsg?: string | null;
  raw?: any;
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;

/** Pull every result URL out of a render-node poll payload (various shapes). */
export function extractUnrealUrls(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) out.push(v);
  };
  // Preferred: { resultUrls: [...] }
  if (Array.isArray(payload.resultUrls)) payload.resultUrls.forEach(push);
  // Aliases for a single URL.
  push(payload.videoUrl);
  push(payload.imageUrl);
  push(payload.url);
  if (Array.isArray(payload.urls)) payload.urls.forEach(push);
  if (out.length) return Array.from(new Set(out));
  // Last resort: walk for any media-looking URL.
  const visit = (v: any): void => {
    if (!v) return;
    if (typeof v === "string" && (VIDEO_EXT_RE.test(v) || IMAGE_EXT_RE.test(v))) out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object") for (const k of Object.keys(v)) visit(v[k]);
  };
  visit(payload);
  return Array.from(new Set(out));
}

/** Decide image vs video from an explicit field, the job type, or the URL. */
export function resolveMediaType(
  explicit: unknown,
  jobType: UnrealJobType | undefined,
  url: string | undefined,
): UnrealMediaType {
  if (explicit === "video" || explicit === "image") return explicit;
  if (url && VIDEO_EXT_RE.test(url)) return "video";
  if (url && IMAGE_EXT_RE.test(url)) return "image";
  return jobType === "cinematic" ? "video" : "image";
}

/** Poll a previously-submitted render job once. Never throws on transient errors. */
export async function unrealPoll(
  handle: { jobId: string; statusUrl?: string | null; jobType?: UnrealJobType },
): Promise<UnrealPollResult> {
  try {
    const path = handle.statusUrl || `/render/${encodeURIComponent(handle.jobId)}`;
    const rec = await unrealFetch(path);
    const status = String(rec?.status || rec?.state || "").toLowerCase();
    if (
      status === "completed" ||
      status === "complete" ||
      status === "success" ||
      status === "succeeded" ||
      status === "done"
    ) {
      const urls = extractUnrealUrls(rec);
      const url = urls[0] || null;
      if (!url) return { state: "failed", failMsg: "render completed without a result url", raw: rec };
      return {
        state: "ready",
        url,
        urls,
        mediaType: resolveMediaType(rec?.mediaType, handle.jobType, url),
        raw: rec,
      };
    }
    if (status === "failed" || status === "fail" || status === "error") {
      return { state: "failed", failMsg: String(rec?.error || rec?.failMsg || "render failed").slice(0, 1000), raw: rec };
    }
    // queued / rendering / in_progress
    return { state: "pending", raw: rec };
  } catch (e: any) {
    // A genuine node outage should surface; transient blips keep polling.
    if (isUnrealOutage(e)) return { state: "failed", failMsg: (e?.message || String(e)).slice(0, 1000) };
    return { state: "pending" };
  }
}

/**
 * Submit + block until a render resolves. Returns the primary URL + media type or
 * throws on failure/timeout. (Convenience for synchronous callers; the art route
 * uses submit + poll separately so jobs survive a server restart.)
 */
export async function runUnrealJob(
  input: UnrealSubmitInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ url: string; urls: string[]; mediaType: UnrealMediaType }> {
  const submit = await unrealSubmit(input);
  const start = Date.now();
  const jobType = toUnrealJobType(input.jobType);
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await unrealPoll({ jobId: submit.jobId, statusUrl: submit.statusUrl, jobType });
    if (res.state === "ready" && res.url) {
      return { url: res.url, urls: res.urls || [res.url], mediaType: res.mediaType || resolveMediaType(undefined, jobType, res.url) };
    }
    if (res.state === "failed") throw new Error(res.failMsg || "unreal render failed");
  }
  throw new Error("unreal render timed out");
}
