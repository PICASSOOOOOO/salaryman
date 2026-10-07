import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./auth";
import { deviceLinksTable } from "./device-links";
import { shadowTowerFloorsTable, shadowTowerOfficeUnitsTable } from "./shadow-tower";

export const desktopOfficePresenceTable = pgTable(
  "desktop_office_presence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull().references(() => deviceLinksTable.id, { onDelete: "cascade" }),
    orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
    floorId: integer("floor_id").references(() => shadowTowerFloorsTable.id, { onDelete: "set null" }),
    officeUnitId: integer("office_unit_id").references(() => shadowTowerOfficeUnitsTable.id, { onDelete: "set null" }),
    city: varchar("city", { length: 20 }).notNull().default("minx_city"),
    roomKey: varchar("room_key", { length: 180 }).notNull(),
    room: varchar("room", { length: 16 }).notNull(),
    floorNumber: integer("floor_number").notNull().default(1),
    x: integer("x").notNull().default(0),
    y: integer("y").notNull().default(0),
    action: varchar("action", { length: 12 }).notNull().default("stand"),
    destinationFloor: integer("destination_floor"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("desktop_office_presence_user_unique").on(table.userId),
    index("desktop_office_presence_org_seen_idx").on(table.orgId, table.lastSeenAt),
    index("desktop_office_presence_room_seen_idx").on(table.roomKey, table.lastSeenAt),
    index("desktop_office_presence_city_elevator_idx").on(table.city, table.room, table.lastSeenAt),
    check("desktop_office_presence_room_check", sql`${table.room} in ('lobby', 'hallway', 'elevator', 'office')`),
    check("desktop_office_presence_action_check", sql`${table.action} in ('stand', 'walk', 'sit', 'sleep', 'ride', 'stair')`),
    check("desktop_office_presence_floor_check", sql`${table.floorNumber} between 1 and 67`),
    check("desktop_office_presence_destination_floor_check", sql`${table.destinationFloor} is null or ${table.destinationFloor} between 1 and 67`),
    check("desktop_office_presence_x_check", sql`${table.x} between 0 and 100000000`),
    check("desktop_office_presence_y_check", sql`${table.y} between 0 and 100000000`),
  ],
);

export type DesktopOfficePresence = typeof desktopOfficePresenceTable.$inferSelect;