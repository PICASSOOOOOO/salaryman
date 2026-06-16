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
 * Like listProviderSummaries() but adds a LIVE reachability probe per backend.
 * Probes run in parallel and each times out quickly (see *HealthCheck helpers),
 * so this never blocks the admin page. An unconfigured backend is reported as
 * "not-configured" with no probe — no behavior change vs the sync summary.
 */
export async function listProviderSummariesWithHealth(): Promise<ProviderSummary[]> {
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
      try {
        const r = await p.probe();
        return { ...base, health: r.ok ? "online" : "offline", lastError: r.ok ? null : r.error ?? null };
      } catch (e: any) {
        return { ...base, health: "offline", lastError: (e?.message || String(e)).slice(0, 300) };
      }
    }),
  );
}
