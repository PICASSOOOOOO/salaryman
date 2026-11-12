import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./auth";

export const desktopBuildingObjectStatesTable = pgTable(
  "desktop_building_object_states",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    scopeKey: varchar("scope_key", { length: 180 }).notNull(),
    city: varchar("city", { length: 20 }).notNull(),
    floorNumber: integer("floor_number").notNull(),
    room: varchar("room", { length: 24 }).notNull(),
    objectId: varchar("object_id", { length: 80 }).notNull(),
    orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
    ownerUserId: varchar("owner_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    cleanliness: integer("cleanliness").notNull().default(80),
    condition: integer("condition").notNull().default(85),
    physicsX: integer("physics_x"),
    physicsY: integer("physics_y"),
    rotationDegrees: integer("rotation_degrees").notNull().default(0),
    damage: integer("damage").notNull().default(0),
    burning: boolean("burning").notNull().default(false),
    lastCleanedAt: timestamp("last_cleaned_at", { withTimezone: true }).notNull().defaultNow(),
    lastMaintainedAt: timestamp("last_maintained_at", { withTimezone: true }).notNull().defaultNow(),
    workSessionId: varchar("work_session_id", { length: 64 }),
    workAction: varchar("work_action", { length: 16 }),
    workUserId: varchar("work_user_id", { length: 256 }),
    workStartedAt: timestamp("work_started_at", { withTimezone: true }),
    workDurationMs: integer("work_duration_ms").notNull().default(0),
    workRewardFiat: integer("work_reward_fiat").notNull().default(0),
    workCompletedByUserId: varchar("work_completed_by_user_id", { length: 256 }),
    workCompletedAt: timestamp("work_completed_at", { withTimezone: true }),
    updatedByUserId: varchar("updated_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("desktop_building_object_scope_id_unique").on(table.scopeKey, table.objectId),
    index("desktop_building_object_city_floor_idx").on(table.city, table.floorNumber),
    index("desktop_building_object_work_started_idx").on(table.workStartedAt),
    index("desktop_building_object_work_completed_idx").on(table.workCompletedAt, table.floorNumber, table.room),
    check("desktop_building_object_floor_check", sql`${table.floorNumber} between 1 and 67`),
    check("desktop_building_object_cleanliness_check", sql`${table.cleanliness} between 0 and 100`),
    check("desktop_building_object_condition_check", sql`${table.condition} between 0 and 100`),
    check("desktop_building_object_rotation_check", sql`${table.rotationDegrees} between 0 and 359`),
    check("desktop_building_object_damage_check", sql`${table.damage} between 0 and 100`),
  ],
);

// Drizzle-Zod already excludes generatedAlwaysAsIdentity() columns, so `id`
// is not part of the insert schema and must not be passed to Zod 4's strict omit.
export const insertDesktopBuildingObjectStateSchema = createInsertSchema(desktopBuildingObjectStatesTable)
  .omit({ createdAt: true, updatedAt: true });
export type InsertDesktopBuildingObjectState = z.infer<typeof insertDesktopBuildingObjectStateSchema>;
export type DesktopBuildingObjectState = typeof desktopBuildingObjectStatesTable.$inferSelect;
