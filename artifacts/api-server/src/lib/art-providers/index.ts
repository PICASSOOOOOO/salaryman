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
import { blenderProvider, BLENDER_PROVIDER_ID } from "./blender-provider";
import { db, providerHealthTransitionsTable } from "@workspace/db";
import { and, desc, eq, notInArray } from "drizzle-orm";

export * from "./types";
export { NANO_BANANA_PROVIDER_ID, FAL_PROVIDER_ID, UNREAL_PROVIDER_ID, BLENDER_PROVIDER_ID };

/** The backend every asset uses unless told otherwise. */
export const DEFAULT_PROVIDER_ID = NANO_BANANA_PROVIDER_ID;

const REGISTRY: ArtProvider[] = [nanoBananaProvider, falProvider, unrealProvider, blenderProvider];
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

/** One recorded health transition: when the backend flipped and the state it flipped TO. */
export interface ProviderHealthEvent {
  /** Epoch ms when this state was first observed. */
  at: number;
  /** The health value the backend transitioned to at `at`. */
  health: ProviderHealth;
}

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
  /**
   * Epoch ms when the backend's current health was first observed — the start of
   * the current run. Server-tracked, so "online/offline since …" survives admin
   * page reloads and is shared across admins. Populated by the *WithHealth list.
   */
  lastChangedAt?: number;
  /** Most-recent-first list of the last few health transitions for this backend. */
  healthHistory?: ProviderHealthEvent[];
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

/** How many recent transitions to retain per provider for the history list. */
export const PROVIDER_HEALTH_HISTORY_LIMIT = 8;

interface ProviderHealthRecord {
  /** Current health value. */
  current: ProviderHealth;
  /** Epoch ms when `current` was first observed (start of the current run). */
  lastChangedAt: number;
  /** Most-recent-first transitions (newest at index 0), capped at the limit. */
  history: ProviderHealthEvent[];
}

/**
 * Server-side health-transition log lives in the `provider_health_transitions`
 * table (NOT an in-memory Map). This is what makes "online/offline since …"
 * survive a server restart and stay consistent across admins — the timeline is
 * persisted, not held in any one process or browser. Each row is one actual flip;
 * the newest row for a provider is the start of its current run.
 */

/**
 * Read a provider's persisted timeline (newest-first) into a ProviderHealthRecord.
 * Assumes at least one row exists for the id.
 */
async function loadProviderHealthRecord(id: string): Promise<ProviderHealthRecord> {
  const rows = await db
    .select()
    .from(providerHealthTransitionsTable)
    .where(eq(providerHealthTransitionsTable.providerId, id))
    .orderBy(desc(providerHealthTransitionsTable.at), desc(providerHealthTransitionsTable.id))
    .limit(PROVIDER_HEALTH_HISTORY_LIMIT);
  const history: ProviderHealthEvent[] = rows.map((r) => ({
    at: Number(r.at),
    health: r.health as ProviderHealth,
  }));
  return {
    current: history[0].health,
    lastChangedAt: history[0].at,
    history,
  };
}

/**
 * Keep only the most recent PROVIDER_HEALTH_HISTORY_LIMIT rows for a provider so
 * the transitions table can't grow without bound. Called right after each insert.
 */
async function pruneProviderHealthHistory(id: string): Promise<void> {
  const keep = await db
    .select({ id: providerHealthTransitionsTable.id })
    .from(providerHealthTransitionsTable)
    .where(eq(providerHealthTransitionsTable.providerId, id))
    .orderBy(desc(providerHealthTransitionsTable.at), desc(providerHealthTransitionsTable.id))
    .limit(PROVIDER_HEALTH_HISTORY_LIMIT);
  if (keep.length < PROVIDER_HEALTH_HISTORY_LIMIT) return; // nothing to prune yet
  await db
    .delete(providerHealthTransitionsTable)
    .where(
      and(
        eq(providerHealthTransitionsTable.providerId, id),
        notInArray(
          providerHealthTransitionsTable.id,
          keep.map((r) => r.id),
        ),
      ),
    );
}

/**
 * Record a freshly-observed health value for a provider and return its timeline.
 * Idempotent within a state: re-observing the SAME health does not insert a row
 * or move lastChangedAt — only an actual flip is persisted as a transition.
 */
async function recordProviderHealth(
  id: string,
  health: ProviderHealth,
  now: number,
): Promise<ProviderHealthRecord> {
  const [latest] = await db
    .select()
    .from(providerHealthTransitionsTable)
    .where(eq(providerHealthTransitionsTable.providerId, id))
    .orderBy(desc(providerHealthTransitionsTable.at), desc(providerHealthTransitionsTable.id))
    .limit(1);
  if (!latest || latest.health !== health) {
    await db.insert(providerHealthTransitionsTable).values({ providerId: id, health, at: now });
    await pruneProviderHealthHistory(id);
  }
  return loadProviderHealthRecord(id);
}

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
 * Wipe the persisted health-transition log. Exported for test isolation; not
 * used in normal operation (the log is meant to persist across server restarts).
 */
export async function clearProviderHealthHistory(): Promise<void> {
  await db.delete(providerHealthTransitionsTable);
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
      // Resolve this backend's current health (from config, cache, or a live probe).
      let health: ProviderHealth;
      let lastError: string | null = null;
      if (!base.configured) {
        health = "not-configured";
      } else if (!p.probe) {
        health = "unknown";
      } else {
        const cached = healthCache.get(p.id);
        if (cached && now - cached.at < PROVIDER_HEALTH_CACHE_TTL_MS) {
          health = cached.health;
          lastError = cached.lastError;
        } else {
          const fresh = await probeProvider(p);
          health = fresh.health;
          lastError = fresh.lastError;
        }
      }
      // Server owns the timeline: record this observation (a no-op unless the
      // health actually flipped) so lastChangedAt + history survive page reloads
      // and are identical for every admin.
      const rec = await recordProviderHealth(p.id, health, now);
      return {
        ...base,
        health,
        lastError,
        lastChangedAt: rec.lastChangedAt,
        healthHistory: rec.history.slice(),
      };
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
