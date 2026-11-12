import { pgTable, serial, varchar, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Per-player fog-of-war + waypoint state.
 *
 * `exploredTiles` is a flat array of "qx,qy" coarse tile IDs the player has
 * walked through. We store it as JSONB so we can replace it wholesale on
 * every visit batch without a join — exploration is one of those things
 * where read latency matters more than write efficiency. Each tile is
 * roughly 256 world units; a fully explored map is on the order of a few
 * thousand tile IDs, well within Postgres jsonb size budgets.
 *
 * `waypointX/Y` is a single active waypoint in world coordinates (null = none).
 * The compass HUD reads it on every tick; cheap to keep here next to fog.
 */
export const playerExplorationTable = pgTable(
  "player_exploration",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull().unique(),
    exploredTiles: jsonb("explored_tiles").$type<string[]>().notNull().default([]),
    waypointX: integer("waypoint_x"),
    waypointY: integer("waypoint_y"),
    waypointLabel: varchar("waypoint_label", { length: 80 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("player_exploration_user_idx").on(t.userId),
  }),
);

export type PlayerExploration = typeof playerExplorationTable.$inferSelect;
