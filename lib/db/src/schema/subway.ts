import { pgTable, serial, varchar, integer, timestamp, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Subway stations are persistent world fixtures. Players must DISCOVER a
// station (by walking near it in the world) before they can fast-travel to
// it. Fares scale with euclidean distance, clamped to ƒ1,000–10,000.
export const subwayStationsTable = pgTable("subway_stations", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  district: varchar("district", { length: 80 }).notNull(),
  worldX: integer("world_x").notNull(),
  worldY: integer("world_y").notNull(),
  // discovery_radius — how close a player must be before the station auto-unlocks
  discoveryRadius: integer("discovery_radius").notNull().default(180),
  description: text("description").notNull().default(""),
  active: integer("active").notNull().default(1), // 0/1; ints stay portable
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("subway_stations_district_idx").on(t.district),
]);

export const userDiscoveredStationsTable = pgTable("user_discovered_subway_stations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  stationId: integer("station_id").notNull(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("user_station_uq").on(t.userId, t.stationId),
  index("user_station_user_idx").on(t.userId),
]);

export const subwayTripsTable = pgTable("subway_trips", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  fromStationId: integer("from_station_id").notNull(),
  toStationId: integer("to_station_id").notNull(),
  fareCents: integer("fare_cents").notNull(), // ƒ stored as integer ƒ-cents (1ƒ = 100)
  distance: integer("distance").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("subway_trips_user_idx").on(t.userId),
  index("subway_trips_taken_idx").on(t.takenAt),
]);

export const insertSubwayStationSchema = createInsertSchema(subwayStationsTable).omit({ id: true, createdAt: true });
export type SubwayStation = typeof subwayStationsTable.$inferSelect;
export type DiscoveredStation = typeof userDiscoveredStationsTable.$inferSelect;
export type SubwayTrip = typeof subwayTripsTable.$inferSelect;
