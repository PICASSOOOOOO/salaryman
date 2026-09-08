import { pgTable, serial, varchar, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const worldEventsTable = pgTable("world_events", {
  id: serial("id").primaryKey(),
  cityId: varchar("city_id", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  locationX: integer("location_x").notNull(),
  locationY: integer("location_y").notNull(),
  buildingId: varchar("building_id", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  spawnedAt: timestamp("spawned_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolverUserIds: jsonb("resolver_user_ids").$type<string[]>().default([]),
  rewardFiat: integer("reward_fiat").notNull().default(0),
}, (t) => [
  index("world_events_city_status_idx").on(t.cityId, t.status),
]);

export const eventResponsesTable = pgTable("event_responses", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  rewardPaid: integer("reward_paid").notNull().default(0),
}, (t) => [
  index("event_responses_event_idx").on(t.eventId),
  index("event_responses_user_idx").on(t.userId),
]);

export type WorldEvent = typeof worldEventsTable.$inferSelect;
export type EventResponse = typeof eventResponsesTable.$inferSelect;
