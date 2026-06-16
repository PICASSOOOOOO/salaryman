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
      const res = await fetch(url(`api/art/asset/${encodeURIComponent(key)}`), {
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

/**
 * Hook-friendly poll: returns the current url (or null) and re-checks every
 * `intervalMs` until the asset is ready.
 *
 * Usage:
 *   const url = useArtAsset("scene_bathroom");
 */
import { useEffect, useState } from "react";

export function useArtAsset(key: string, intervalMs = 4000): string | null {
  const [u, setU] = useState<string | null>(() => memoryCache.get(key)?.url ?? null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const a = await fetchArtAsset(key);
      if (cancelled) return;
      if (a?.url) {
        setU(a.url);
        return;
      }
      if (a?.status === "failed") return;
      timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs]);
  return u;
}
