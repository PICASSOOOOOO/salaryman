import { vi } from "vitest";

/**
 * Controllable mock of the art-provider registry (../lib/art-providers).
 *
 * The test-render route only cares about three provider behaviours:
 *  - isConfigured(): gates whether jobs are fired at all
 *  - start(): kicks off a generation job (must NOT hit real apipass/fal/unreal)
 *  - the registry resolution (getProvider / DEFAULT_PROVIDER_ID)
 *
 * This mock records every start() call in `mockState.starts` so tests can assert
 * which backend was actually used (proving no silent fallback to Nano Banana),
 * and lets each test flip which backends report configured.
 *
 * Mirrors the twilioMock pattern: a shared mutable `mockState` plus a factory
 * consumed by vi.mock.
 */

export const NANO_ID = "nano-banana";
export const FAL_ID = "fal";
export const UNREAL_ID = "unreal";

export interface ArtProvidersMockState {
  configured: Record<string, boolean>;
  starts: { id: string; req: Record<string, unknown> }[];
  /** Per-provider live-probe result, keyed by id. Defaults to online when configured. */
  health: Record<string, "online" | "offline" | "unknown">;
  /** How many times the (uncached) live probe ran — proves ?fresh=1 re-probes. */
  probeCount: number;
  /** Whether clearProviderHealthCache() was called (proves ?fresh=1 clears it). */
  cacheCleared: boolean;
  /**
   * The mock's probe cache. Lives on mockState (not a factory closure) so
   * resetArtProvidersMock() can wipe it between tests — otherwise warmed entries
   * leak across tests and break probe-count assertions.
   */
  healthCache: Map<string, "online" | "offline" | "unknown">;
}

export const mockState: ArtProvidersMockState = {
  configured: { [NANO_ID]: true, [FAL_ID]: false, [UNREAL_ID]: false },
  starts: [],
  health: {},
  probeCount: 0,
  cacheCleared: false,
  healthCache: new Map(),
};

export function resetArtProvidersMock() {
  mockState.configured = { [NANO_ID]: true, [FAL_ID]: false, [UNREAL_ID]: false };
  mockState.starts = [];
  mockState.health = {};
  mockState.probeCount = 0;
  mockState.cacheCleared = false;
  mockState.healthCache.clear();
}

function makeProvider(id: string, label: string) {
  return {
    id,
    label,
    description: `${label} (mock)`,
    isConfigured: () => !!mockState.configured[id],
    start: vi.fn(async (req: Record<string, unknown>) => {
      mockState.starts.push({ id, req });
      return { taskId: `task-${id}-${(req.jobType as string) ?? "x"}`, meta: null };
    }),
    poll: vi.fn(async () => ({ state: "pending" as const })),
  };
}

export function makeArtProvidersMock() {
  const nano = makeProvider(NANO_ID, "Nano Banana");
  const fal = makeProvider(FAL_ID, "fal.ai");
  const unreal = makeProvider(UNREAL_ID, "Unreal Render Node");
  const registry = [nano, fal, unreal];
  const byId = new Map(registry.map((p) => [p.id, p]));
  const DEFAULT_PROVIDER_ID = NANO_ID;

  // The mock mirrors the real registry's caching contract: a live probe only runs
  // on a cache miss, and clearProviderHealthCache() empties the cache so the next
  // summary call re-probes (the ?fresh=1 path). The cache lives on mockState so it
  // resets between tests.
  const summaryFor = (p: (typeof registry)[number]) => {
    const base = {
      id: p.id,
      label: p.label,
      description: p.description,
      configured: p.isConfigured(),
      isDefault: p.id === DEFAULT_PROVIDER_ID,
    };
    if (!base.configured) return { ...base, health: "not-configured" as const, lastError: null };
    const cached = mockState.healthCache.get(p.id);
    if (cached) return { ...base, health: cached, lastError: null };
    // Cache miss → a live probe runs.
    mockState.probeCount += 1;
    const health = mockState.health[p.id] ?? "online";
    mockState.healthCache.set(p.id, health);
    return { ...base, health, lastError: null };
  };

  return {
    DEFAULT_PROVIDER_ID,
    NANO_BANANA_PROVIDER_ID: NANO_ID,
    FAL_PROVIDER_ID: FAL_ID,
    UNREAL_PROVIDER_ID: UNREAL_ID,
    PROVIDER_HEALTH_CACHE_TTL_MS: 20_000,
    getProvider: (id?: string | null) => (id && byId.get(id)) || byId.get(DEFAULT_PROVIDER_ID)!,
    listProviders: () => registry,
    listProviderSummaries: () =>
      registry.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        configured: p.isConfigured(),
        isDefault: p.id === DEFAULT_PROVIDER_ID,
      })),
    listProviderSummariesWithHealth: async () => registry.map(summaryFor),
    listProviderSummariesWithHealthNonBlocking: () => registry.map(summaryFor),
    clearProviderHealthCache: () => {
      mockState.cacheCleared = true;
      mockState.healthCache.clear();
    },
  };
}
