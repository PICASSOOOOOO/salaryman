/**
 * Art-provider registry — the single place the art pipeline resolves a backend.
 *
 * Each art_assets row has a `backend` (provider id). The route asks
 * getProvider(row.backend) to start/poll generation. Adding a backend = register
 * one ArtProvider here; nothing in the route or the game changes.
 *
 * Default backend is Nano Banana, so any row without an explicit backend (and the
 * whole existing art kit) behaves exactly as before.
 */

import type { ArtProvider } from "./types";
import { nanoBananaProvider, NANO_BANANA_PROVIDER_ID } from "./nano-banana-provider";
import { falProvider, FAL_PROVIDER_ID } from "./fal-provider";
import { unrealProvider, UNREAL_PROVIDER_ID } from "./unreal-provider";

export * from "./types";
export { NANO_BANANA_PROVIDER_ID, FAL_PROVIDER_ID, UNREAL_PROVIDER_ID };

/** The backend every asset uses unless told otherwise. */
export const DEFAULT_PROVIDER_ID = NANO_BANANA_PROVIDER_ID;

const REGISTRY: ArtProvider[] = [nanoBananaProvider, falProvider, unrealProvider];
const BY_ID = new Map<string, ArtProvider>(REGISTRY.map((p) => [p.id, p]));

/** Look up a provider by id, falling back to the default for unknown ids. */
export function getProvider(id: string | null | undefined): ArtProvider {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_PROVIDER_ID)!;
}

/** All registered providers (for the admin backend picker). */
export function listProviders(): ArtProvider[] {
  return REGISTRY;
}

/**
 * Reachability state of a backend, derived from a live probe:
 *   - "not-configured" — no API key / node URL; the pipeline never routes here.
 *   - "online"         — the backend answered an HTTP request.
 *   - "offline"        — configured but unreachable / overloaded (see lastError).
 *   - "unknown"        — configured but the provider exposes no probe.
 *   - "checking"       — a fresh probe is in flight (no fresh cache yet). Transient:
 *                        the non-blocking summary returns this immediately while the
 *                        real probe runs in the background, so the admin page never
 *                        freezes on a slow/offline backend's full timeout.
 */
export type ProviderHealth = "online" | "offline" | "not-configured" | "unknown" | "checking";

/** Serializable provider summary for the admin art library response. */
export interface ProviderSummary {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  isDefault: boolean;
  /** Live reachability (populated by listProviderSummariesWithHealth). */
  health?: ProviderHealth;
  /** Last probe failure reason, if any (null when online/not-configured). */
  lastError?: string | null;
}

export function listProviderSummaries(): ProviderSummary[] {
  return REGISTRY.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    configured: p.isConfigured(),
    isDefault: p.id === DEFAULT_PROVIDER_ID,
  }));
}

/**
 * How long a provider's live probe result is reused before re-probing. The admin
 * Art Library re-fetches health on every load (and on Refresh); without this a
 * configured-but-offline backend would burn the full probe timeout on EVERY load.
 * Kept short so a backend that just came back online shows up quickly.
 */
export const PROVIDER_HEALTH_CACHE_TTL_MS = 20_000;

interface CachedProbe {
  health: Exclude<ProviderHealth, "not-configured" | "checking">;
  lastError: string | null;
  at: number;
}

/** Per-provider probe-result cache, keyed by provider id. */
const healthCache = new Map<string, CachedProbe>();

/** Per-provider in-flight background probe, so we never double-fire one. */
const inflightProbes = new Map<string, Promise<CachedProbe>>();

/**
 * Drop all cached probe results, forcing the next listProviderSummariesWithHealth()
 * to re-probe every backend. Exported for tests (and any future explicit refresh).
 */
export function clearProviderHealthCache(): void {
  healthCache.clear();
  inflightProbes.clear();
}

/** Run a provider's probe once and cache the result. Never throws. */
async function probeProvider(p: ArtProvider): Promise<CachedProbe> {
  let health: Exclude<ProviderHealth, "not-configured" | "checking">;
  let lastError: string | null;
  try {
    const r = await p.probe!();
    health = r.ok ? "online" : "offline";
    lastError = r.ok ? null : r.error ?? null;
  } catch (e: any) {
    health = "offline";
    lastError = (e?.message || String(e)).slice(0, 300);
  }
  const entry: CachedProbe = { health, lastError, at: Date.now() };
  healthCache.set(p.id, entry);
  return entry;
}

/**
 * Kick off a probe in the background (deduped per provider). The returned "checking"
 * state is what the non-blocking summary reports while this runs; once it resolves
 * the cache is populated and the next summary call flips to online/offline.
 */
function startBackgroundProbe(p: ArtProvider): void {
  if (inflightProbes.has(p.id)) return;
  const promise = probeProvider(p).finally(() => inflightProbes.delete(p.id));
  inflightProbes.set(p.id, promise);
  // probeProvider never throws, but guard against an unhandled rejection anyway.
  promise.catch(() => {});
}

/**
 * Like listProviderSummaries() but adds a LIVE reachability probe per backend.
 * Probes run in parallel and each times out quickly (see *HealthCheck helpers),
 * so this never blocks the admin page. An unconfigured backend is reported as
 * "not-configured" with no probe — no behavior change vs the sync summary.
 *
 * Probe results are cached per provider for PROVIDER_HEALTH_CACHE_TTL_MS so rapid
 * reloads of the admin Art Library don't re-run a network round-trip (or eat the
 * full timeout for an offline backend) every single time. The configured/probe
 * state is always re-evaluated, so a backend whose config changes (or whose key
 * is removed) is reflected immediately — only the network probe result is cached.
 */
export async function listProviderSummariesWithHealth(): Promise<ProviderSummary[]> {
  const now = Date.now();
  return Promise.all(
    REGISTRY.map(async (p): Promise<ProviderSummary> => {
      const base: ProviderSummary = {
        id: p.id,
        label: p.label,
        description: p.description,
        configured: p.isConfigured(),
        isDefault: p.id === DEFAULT_PROVIDER_ID,
      };
      if (!base.configured) return { ...base, health: "not-configured", lastError: null };
      if (!p.probe) return { ...base, health: "unknown", lastError: null };
      const cached = healthCache.get(p.id);
      if (cached && now - cached.at < PROVIDER_HEALTH_CACHE_TTL_MS) {
        return { ...base, health: cached.health, lastError: cached.lastError };
      }
      const fresh = await probeProvider(p);
      return { ...base, health: fresh.health, lastError: fresh.lastError };
    }),
  );
}

/**
 * Non-blocking sibling of listProviderSummariesWithHealth(). Returns synchronously:
 *   - fresh-cached backends render their last known status immediately (no change
 *     to the fast path);
 *   - a backend with no fresh cache is reported as "checking" and its real probe
 *     is fired in the background, so the admin page never waits on a slow/offline
 *     backend's full timeout. The client polls again shortly and sees the result.
 *
 * Any stale lastError is carried through the "checking" tick so prior failure
 * context isn't blanked while the re-probe runs.
 */
export function listProviderSummariesWithHealthNonBlocking(): ProviderSummary[] {
  const now = Date.now();
  return REGISTRY.map((p): ProviderSummary => {
    const base: ProviderSummary = {
      id: p.id,
      label: p.label,
      description: p.description,
      configured: p.isConfigured(),
      isDefault: p.id === DEFAULT_PROVIDER_ID,
    };
    if (!base.configured) return { ...base, health: "not-configured", lastError: null };
    if (!p.probe) return { ...base, health: "unknown", lastError: null };
    const cached = healthCache.get(p.id);
    if (cached && now - cached.at < PROVIDER_HEALTH_CACHE_TTL_MS) {
      return { ...base, health: cached.health, lastError: cached.lastError };
    }
    startBackgroundProbe(p);
    return { ...base, health: "checking", lastError: cached?.lastError ?? null };
  });
}
