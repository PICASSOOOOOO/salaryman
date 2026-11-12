import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Asset = { key: string; url: string | null; status: string };
type LibraryResponse = { assets: Asset[] };

const cache = new Map<string, string>();
let inflight: Promise<void> | null = null;
let lastFailureAt = 0;
const RETRY_COOLDOWN_MS = 4000;

async function loadLibrary(): Promise<void> {
  // Already populated — no need to re-fetch.
  if (cache.size > 0) return;
  // In-flight — share the same promise so concurrent callers wait once.
  if (inflight) return inflight;
  // Back off briefly after a failure so we don't hammer the API every render.
  if (Date.now() - lastFailureAt < RETRY_COOLDOWN_MS) return;

  inflight = (async () => {
    try {
      const res = await apiFetch('api/art/library');
      if (!res.ok) {
        lastFailureAt = Date.now();
        return;
      }
      const data = (await res.json()) as LibraryResponse;
      let found = 0;
      for (const a of data.assets || []) {
        if (a.url && a.status === 'ready') {
          cache.set(a.key, a.url);
          found++;
        }
      }
      if (found === 0) lastFailureAt = Date.now();
    } catch {
      // Network error — record so subsequent renders can retry after cooldown.
      lastFailureAt = Date.now();
    } finally {
      // Critical: clear inflight so future renders can retry on transient failure.
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Fetch (and memo-cache) the URLs for a set of art-kit keys. Used by trailer
 * scenes to lay actual Nano Banana artwork under the procedural choreography.
 *
 * Returns a `Record<key, url|null>` immediately (with `null` for any key not
 * yet loaded) and re-renders when the library finishes loading.
 */
export function useArtKit(keys: string[]): Record<string, string | null> {
  const [, force] = useState(0);
  useEffect(() => {
    let mounted = true;
    void loadLibrary().then(() => {
      if (mounted) force((n) => n + 1);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const out: Record<string, string | null> = {};
  for (const k of keys) out[k] = cache.get(k) ?? null;
  return out;
}
