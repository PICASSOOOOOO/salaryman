import { pgTable, serial, varchar, bigint, index } from "drizzle-orm/pg-core";

/**
 * Persistent log of health transitions (render backends AND platform connections).
 *
 * Each row records the moment a tracked dependency's reachability flipped to a new
 * state. Two namespaces share this table, distinguished by `provider_id`:
 *   - render backends: bare provider ids (e.g. "nano-banana", "fal", "unreal").
 *   - platform connections: ids prefixed "conn:" (e.g. "conn:stripe-payments"),
 *     written by the in-process connection-health monitor.
 *
 * Only actual flips are stored — re-observing the same state inserts nothing — so
 * the newest row for a given id is the start of its current run ("online/offline
 * since …" or "Stripe was down 10:02–10:09").
 *
 * This is what makes the admin health timeline survive a server restart: it lives
 * in the database instead of an in-memory Map, and is shared across all admins.
 * Old rows are pruned per id (see PROVIDER_HEALTH_HISTORY_LIMIT) so the table
 * never grows unbounded.
 *
 * `at` is epoch milliseconds (matching the in-memory representation the admin UI
 * already consumes) rather than a timestamp column, so the value round-trips
 * without timezone/precision surprises. `detail` is an optional human-readable
 * reason for the flip (e.g. the last probe error) — null for render backends,
 * populated by the connection monitor.
 */
export const providerHealthTransitionsTable = pgTable(
  "provider_health_transitions",
  {
    id: serial("id").primaryKey(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    health: varchar("health", { length: 16 }).notNull(),
    at: bigint("at", { mode: "number" }).notNull(),
    detail: varchar("detail", { length: 300 }),
  },
  (t) => ({
    byProvider: index("provider_health_provider_at_idx").on(t.providerId, t.at),
  }),
);

export type ProviderHealthTransition = typeof providerHealthTransitionsTable.$inferSelect;
