import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { deviceLinksTable } from "./device-links";

export const towerOperationsStateTable = pgTable(
  "tower_operations_state",
  {
    buildingKey: varchar("building_key", { length: 64 }).notNull().default("shadow_tower"),
    accumulatedTrash: integer("accumulated_trash").notNull().default(0),
    incomingSupplyCrates: integer("incoming_supply_crates").notNull().default(0),
    storedSupplyCrates: integer("stored_supply_crates").notNull().default(0),
    processedTrash: integer("processed_trash").notNull().default(0),
    lastTrashTickAt: timestamp("last_trash_tick_at", { withTimezone: true }).notNull().defaultNow(),
    lastSupplyDeliveryAt: timestamp("last_supply_delivery_at", { withTimezone: true }).notNull().defaultNow(),
    lastGeneratorWorkAt: timestamp("last_generator_work_at", { withTimezone: true }).notNull().defaultNow(),
    lastPumpWorkAt: timestamp("last_pump_work_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "tower_operations_state_building_pk", columns: [table.buildingKey] }),
    check("tower_operations_state_trash_check", sql`${table.accumulatedTrash} between 0 and 1000000`),
    check("tower_operations_state_supplies_check", sql`${table.incomingSupplyCrates} between 0 and 1000000`),
    check("tower_operations_state_stored_supplies_check", sql`${table.storedSupplyCrates} between 0 and 1000000`),
    check("tower_operations_state_processed_trash_check", sql`${table.processedTrash} between 0 and 1000000`),
  ],
);

export const towerWasteHaulsTable = pgTable(
  "tower_waste_hauls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 256 }).notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull()
      .references(() => deviceLinksTable.id, { onDelete: "cascade" }),
    units: integer("units").notNull(),
    pickedUpFloor: integer("picked_up_floor").notNull(),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tower_waste_hauls_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.deliveredAt} is null`),
    index("tower_waste_hauls_link_idx").on(table.linkId, table.pickedUpAt),
    check("tower_waste_hauls_units_check", sql`${table.units} between 1 and 100`),
    check("tower_waste_hauls_floor_check", sql`${table.pickedUpFloor} in (1, 6)`),
  ],
);

export const towerRestroomSessionsTable = pgTable(
  "tower_restroom_sessions",
  {
    userId: varchar("user_id", { length: 256 }).notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull()
      .references(() => deviceLinksTable.id, { onDelete: "cascade" }),
    floorNumber: integer("floor_number").notNull(),
    stallKey: varchar("stall_key", { length: 48 }).notNull(),
    sessionId: uuid("session_id").notNull().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "tower_restroom_sessions_user_pk", columns: [table.userId] }),
    uniqueIndex("tower_restroom_sessions_stall_unique").on(table.floorNumber, table.stallKey),
    check("tower_restroom_sessions_floor_check", sql`${table.floorNumber} in (1, 6)`),
  ],
);

export const careerPositionsTable = pgTable(
  "career_positions",
  {
    positionKey: varchar("position_key", { length: 220 }).notNull(),
    employerKey: varchar("employer_key", { length: 120 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    department: varchar("department", { length: 80 }).notNull().default(""),
    incumbentName: varchar("incumbent_name", { length: 120 }).notNull(),
    incumbentSince: timestamp("incumbent_since", { withTimezone: true }).notNull().defaultNow(),
    nextTurnoverAt: timestamp("next_turnover_at", { withTimezone: true }).notNull().defaultNow(),
    lastTurnoverAt: timestamp("last_turnover_at", { withTimezone: true }),
    baselineOutputUnits: integer("baseline_output_units").notNull().default(20),
    baselineAttendanceDays: integer("baseline_attendance_days").notNull().default(18),
    baselineReliabilityPct: integer("baseline_reliability_pct").notNull().default(88),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "career_positions_position_pk", columns: [table.positionKey] }),
    index("career_positions_employer_idx").on(table.employerKey),
    check("career_positions_output_check", sql`${table.baselineOutputUnits} between 1 and 1000000`),
    check("career_positions_attendance_check", sql`${table.baselineAttendanceDays} between 1 and 31`),
    check("career_positions_reliability_check", sql`${table.baselineReliabilityPct} between 1 and 100`),
  ],
);

export const careerWorkEventsTable = pgTable(
  "career_work_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    positionKey: varchar("position_key", { length: 220 }).notNull()
      .references(() => careerPositionsTable.positionKey, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 256 }).notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("started"),
    outputUnits: integer("output_units").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("career_work_events_event_key_idx").on(table.eventKey),
    index("career_work_events_position_user_completed_idx")
      .on(table.positionKey, table.userId, table.completedAt),
    index("career_work_events_started_idx").on(table.status, table.startedAt),
    check("career_work_events_status_check", sql`${table.status} in ('started', 'completed', 'missed')`),
    check("career_work_events_output_check", sql`${table.outputUnits} between 0 and 1000000`),
    check(
      "career_work_events_completion_check",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null and ${table.outputUnits} > 0) or (${table.status} <> 'completed' and ${table.completedAt} is null)`,
    ),
  ],
);

export const careerPromotionsTable = pgTable(
  "career_promotions",
  {
    employerKey: varchar("employer_key", { length: 120 }).notNull(),
    positionKey: varchar("position_key", { length: 220 }).notNull()
      .references(() => careerPositionsTable.positionKey, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 256 }).notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    level: integer("level").notNull().default(1),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    evaluatedIncumbentSince: timestamp("evaluated_incumbent_since", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      name: "career_promotions_employer_position_user_pk",
      columns: [table.employerKey, table.positionKey, table.userId],
    }),
    check("career_promotions_level_check", sql`${table.level} between 1 and 10`),
  ],
);

export type TowerOperationsState = typeof towerOperationsStateTable.$inferSelect;
export type TowerWasteHaul = typeof towerWasteHaulsTable.$inferSelect;
export type CareerPosition = typeof careerPositionsTable.$inferSelect;
export type CareerWorkEvent = typeof careerWorkEventsTable.$inferSelect;
export type CareerPromotion = typeof careerPromotionsTable.$inferSelect;
