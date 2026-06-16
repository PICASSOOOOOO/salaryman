import { pgTable, serial, varchar, bigint, index } from "drizzle-orm/pg-core";

/**
 * Persistent log of render-backend health transitions.
 *
 * Each row records the moment a provider's reachability flipped to a new state
 * (the art pipeline's "Unreal node went offline at …"). Only actual flips are
 * stored — re-observing the same state inserts nothing — so the newest row for a
 * provider is the start of its current run ("online/offline since …").
 *
 * This is what makes the admin health timeline survive a server restart: it lives
 * in the database instead of an in-memory Map, and is shared across all admins.
 * Old rows are pruned per provider (see PROVIDER_HEALTH_HISTORY_LIMIT) so the
 * table never grows unbounded.
 *
 * `at` is epoch milliseconds (matching the in-memory representation the admin UI
 * already consumes) rather than a timestamp column, so the value round-trips
 * without timezone/precision surprises.
 */
export const providerHealthTransitionsTable = pgTable(
  "provider_health_transitions",
  {
    id: serial("id").primaryKey(),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    health: varchar("health", { length: 16 }).notNull(),
    at: bigint("at", { mode: "number" }).notNull(),
  },
  (t) => ({
    byProvider: index("provider_health_provider_at_idx").on(t.providerId, t.at),
  }),
);

export type ProviderHealthTransition = typeof providerHealthTransitionsTable.$inferSelect;
