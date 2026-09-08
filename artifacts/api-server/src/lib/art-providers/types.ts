/**
 * Art-provider interface — the pluggable backend contract behind the SALARYMAN
 * art pipeline.
 *
 * The game never talks to a provider directly. It polls /api/art/asset/:key and
 * gets back a final CDN URL (see artifacts/interview-helper/src/lib/art.ts). The
 * art-assets route is the only consumer of this interface: it asks a provider to
 * START a generation job (recording the returned handle on the asset row), then
 * POLLs that handle until the job resolves to a URL or fails.
 *
 * Every backend — the current hosted Nano Banana, the flagship hosted fal.ai, or
 * the future self-hosted "Unreal render node" on a local Mac mini — implements
 * this same two-method contract, so swapping/adding backends never touches the
 * consumption side.
 */

/**
 * Render job type. Hosted image backends (Nano Banana, fal) ignore this — they
 * always render a single still. The Unreal render node uses it to pick a render
 * recipe: a centred object/prop, a wide landscape, or a cinematic (video/sequence).
 */
export type ArtJobType = "object" | "landscape" | "cinematic";

/** What kind of media a finished asset is. Defaults to a still image. */
export type ArtMediaType = "image" | "video";

/** What to render. Style is already baked into `prompt` by the art kit. */
export interface ArtGenRequest {
  prompt: string;
  /** Legacy "W:H" ratio string from the kit (e.g. "16:9", "1:1", "3:4"). */
  aspectRatio: string;
  /** Optional render-recipe hint; only the Unreal node honors it. */
  jobType?: ArtJobType;
  /** Asset key, forwarded to providers for their own logging (optional). */
  key?: string;
}

/**
 * Opaque handle to an in-flight generation job. `taskId` is persisted on
 * art_assets.task_id (<=64 chars); `meta` is JSON-serialized into
 * art_assets.backend_meta for providers (like fal) that need extra poll state
 * such as queue status/response URLs.
 */
export interface ArtJobHandle {
  taskId: string;
  meta?: Record<string, unknown> | null;
}

export type ArtJobState = "pending" | "ready" | "failed";

export interface ArtJobStatus {
  state: ArtJobState;
  /** Final public URL (image OR video) once `state === "ready"`. */
  url?: string | null;
  /** All result URLs when the job produced more than one (e.g. a sequence). */
  urls?: string[];
  /** Whether `url` is a still image or a video/sequence. Defaults to "image". */
  mediaType?: ArtMediaType;
  failMsg?: string | null;
}

export interface ArtProvider {
  /** Stable id stored on art_assets.backend (e.g. "nano-banana", "fal"). */
  id: string;
  /** Human label for the admin art library. */
  label: string;
  /** One-line description of what this backend is / its fidelity tier. */
  description: string;
  /** True when this provider has the config (API key / node URL) it needs. */
  isConfigured(): boolean;
  /**
   * Optional lightweight reachability probe. Never throws. Returns whether the
   * backend answered an HTTP request (online) plus the failure reason if not.
   * Used by the admin Art Library to show online/offline WITHOUT a render. A
   * provider without this method reports health "unknown" once configured.
   */
  probe?(): Promise<{ ok: boolean; error?: string }>;
  /** Kick off a generation job; throws on submit failure. */
  start(req: ArtGenRequest): Promise<ArtJobHandle>;
  /** Poll a previously-started job. Never throws — returns "pending" on transient errors. */
  poll(handle: ArtJobHandle): Promise<ArtJobStatus>;
}
