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
 */
export type ProviderHealth = "online" | "offline" | "not-configured" | "unknown";

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
  health: Exclude<ProviderHealth, "not-configured">;
  lastError: string | null;
  at: number;
}

/** Per-provider probe-result cache, keyed by provider id. */
const healthCache = new Map<string, CachedProbe>();

/**
 * Drop all cached probe results, forcing the next listProviderSummariesWithHealth()
 * to re-probe every backend. Exported for tests (and any future explicit refresh).
 */
export function clearProviderHealthCache(): void {
  healthCache.clear();
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
      let health: Exclude<ProviderHealth, "not-configured">;
      let lastError: string | null;
      try {
        const r = await p.probe();
        health = r.ok ? "online" : "offline";
        lastError = r.ok ? null : r.error ?? null;
      } catch (e: any) {
        health = "offline";
        lastError = (e?.message || String(e)).slice(0, 300);
      }
      healthCache.set(p.id, { health, lastError, at: Date.now() });
      return { ...base, health, lastError };
    }),
  );
}
