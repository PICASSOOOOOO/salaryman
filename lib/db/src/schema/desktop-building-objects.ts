import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
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
    updatedByUserId: varchar("updated_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("desktop_building_object_scope_id_unique").on(table.scopeKey, table.objectId),
    index("desktop_building_object_city_floor_idx").on(table.city, table.floorNumber),
    check("desktop_building_object_floor_check", sql`${table.floorNumber} between 1 and 67`),
    check("desktop_building_object_cleanliness_check", sql`${table.cleanliness} between 0 and 100`),
    check("desktop_building_object_condition_check", sql`${table.condition} between 0 and 100`),
  ],
);

export const insertDesktopBuildingObjectStateSchema = createInsertSchema(desktopBuildingObjectStatesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDesktopBuildingObjectState = z.infer<typeof insertDesktopBuildingObjectStateSchema>;
export type DesktopBuildingObjectState = typeof desktopBuildingObjectStatesTable.$inferSelect;
