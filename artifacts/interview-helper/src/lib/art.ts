import { apiFetch } from '@/lib/api-client';
/**
 * Client helper for the Salaryman art kit. Returns a CDN URL for any kit
 * key the server knows about, or null while it's still being baked. The
 * server lazily generates assets via Nano Banana on first request.
 */

const BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.BASE_URL) || "/";

export type ArtStatus = "pending" | "ready" | "failed";

export interface SalarymanArtAsset {
  id: number;
  key: string;
  category: string;
  url: string | null;
  status: ArtStatus;
  aspectRatio: string;
  backend?: string;
  /** "image" (default) or "video" for cinematic render-node assets. */
  mediaType?: "image" | "video";
}

const memoryCache = new Map<string, SalarymanArtAsset>();
const inflight = new Map<string, Promise<SalarymanArtAsset | null>>();

function url(path: string): string {
  return `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export async function fetchArtAsset(key: string): Promise<SalarymanArtAsset | null> {
  const cached = memoryCache.get(key);
  if (cached?.status === "ready" && cached.url) return cached;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const res = await apiFetch(url(`api/art/asset/${encodeURIComponent(key)}`), {
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = await res.json();
      const asset: SalarymanArtAsset | null = body?.asset ?? null;
      if (asset) memoryCache.set(key, asset);
      return asset;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export interface UseArtAssetOptions {
  /**
   * Keep polling even after the server reports `failed`, using capped
   * exponential backoff. This lets a transiently-failed asset (e.g. the art
   * backend was momentarily out of credit / unreachable when it first baked)
   * recover on its own instead of staying blank forever. The server re-attempts
   * generation for a failed asset when it's polled after a cooldown, so the URL
   * appears here once it succeeds. Callers opt in when a visible surface should
   * recover automatically from a transient provider outage.
   */
  retryOnFail?: boolean;
  /** Upper bound on the delay between retries once failures start (ms). */
  maxBackoffMs?: number;
}

/**
 * Hook-friendly poll: returns the current url (or null) and re-checks every
 * `intervalMs` until the asset is ready.
 *
 * Usage:
 *   const url = useArtAsset("scene_bathroom");
 *   const url = useArtAsset("life_birth", 4000, { retryOnFail: true });
 */
import { useEffect, useState } from "react";

export function useArtAsset(
  key: string,
  intervalMs = 4000,
  options: UseArtAssetOptions = {},
): string | null {
  const { retryOnFail = false, maxBackoffMs = 30000 } = options;
  const [u, setU] = useState<string | null>(() => memoryCache.get(key)?.url ?? null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const tick = async () => {
      const a = await fetchArtAsset(key);
      if (cancelled) return;
      if (a?.url) {
        setU(a.url);
        return;
      }
      if (a?.status === "failed") {
        if (!retryOnFail) return;
        // Back off (capped) so a stuck asset isn't hammered while the backend
        // recovers; the server self-heals a failed asset on poll after a cooldown.
        failures += 1;
        const delay = Math.min(intervalMs * 2 ** failures, maxBackoffMs);
        timer = setTimeout(tick, delay);
        return;
      }
      // pending / unknown — steady poll, reset the failure backoff.
      failures = 0;
      timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs, retryOnFail, maxBackoffMs]);
  return u;
}
