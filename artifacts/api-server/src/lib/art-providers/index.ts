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

/** Serializable provider summary for the admin art library response. */
export interface ProviderSummary {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  isDefault: boolean;
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
