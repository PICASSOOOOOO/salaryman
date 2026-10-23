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

export const desktopBasementPresenceTable = pgTable(
  "desktop_basement_presence",
  {
    userId: varchar("user_id", { length: 256 }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull().references(() => deviceLinksTable.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    action: varchar("action", { length: 16 }).notNull().default("stand"),
    workTarget: varchar("work_target", { length: 16 }),
    workSessionId: uuid("work_session_id"),
    workStartedAt: timestamp("work_started_at", { withTimezone: true }),
    lastCompletedWorkSessionId: uuid("last_completed_work_session_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "desktop_basement_presence_user_pk", columns: [table.userId] }),
    index("desktop_basement_presence_level_seen_idx").on(table.level, table.lastSeenAt),
    check("desktop_basement_presence_level_check", sql`${table.level} between 1 and 6`),
    check(
      "desktop_basement_presence_x_check",
      sql`(${table.level} = 1 and ${table.x} between 0 and 56569) or (${table.level} between 2 and 6 and ${table.x} between 0 and 10000)`,
    ),
    check(
      "desktop_basement_presence_y_check",
      sql`(${table.level} = 1 and ${table.y} between 0 and 28284) or (${table.level} between 2 and 6 and ${table.y} between 0 and 10000)`,
    ),
    check("desktop_basement_presence_action_check", sql`${table.action} in ('stand', 'walk', 'attack', 'maintenance')`),
    check("desktop_basement_presence_work_target_check", sql`${table.workTarget} is null or ${table.workTarget} in ('power', 'plumbing', 'upkeep')`),
  ],
);

export const desktopBasementPestsTable = pgTable(
  "desktop_basement_pests",
  {
    id: uuid("id").notNull().defaultRandom(),
    buildingKey: varchar("building_key", { length: 64 }).notNull().default("shadow_tower"),
    level: integer("level").notNull(),
    spawnNumber: integer("spawn_number").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    health: integer("health").notNull(),
    maxHealth: integer("max_health").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    bountyFiat: integer("bounty_fiat").notNull(),
    defeatedByUserId: varchar("defeated_by_user_id", { length: 256 }).references(() => usersTable.id, { onDelete: "set null" }),
    defeatedAt: timestamp("defeated_at", { withTimezone: true }),
    lastNpcWorkedAt: timestamp("last_npc_worked_at", { withTimezone: true }),
    claimedByUserId: varchar("claimed_by_user_id", { length: 256 }).references(() => usersTable.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    soldByUserId: varchar("sold_by_user_id", { length: 256 }).references(() => usersTable.id, { onDelete: "set null" }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "desktop_basement_pests_id_pk", columns: [table.id] }),
    uniqueIndex("desktop_basement_pests_spawn_unique").on(table.buildingKey, table.level, table.spawnNumber),
    index("desktop_basement_pests_level_status_idx").on(table.buildingKey, table.level, table.status),
    check("desktop_basement_pests_level_check", sql`${table.level} between 1 and 6`),
    check("desktop_basement_pests_kind_check", sql`${table.kind} in ('rat', 'snake')`),
    check("desktop_basement_pests_status_check", sql`${table.status} in ('active', 'carcass', 'sold')`),
    check("desktop_basement_pests_position_check", sql`${table.x} between 0 and 10000 and ${table.y} between 0 and 10000`),
    check("desktop_basement_pests_health_check", sql`${table.maxHealth} > 0 and ${table.health} between 0 and ${table.maxHealth}`),
    check("desktop_basement_pests_bounty_check", sql`${table.bountyFiat} between 0 and 100000`),
    check("desktop_basement_pests_defeat_state_check", sql`(${table.status} = 'active' and ${table.health} > 0 and ${table.defeatedAt} is null) or (${table.status} in ('carcass', 'sold') and ${table.health} = 0 and ${table.defeatedAt} is not null)`),
  ],
);

export const desktopBasementAttackEventsTable = pgTable(
  "desktop_basement_attack_events",
  {
    id: uuid("id").notNull().defaultRandom(),
    userId: varchar("user_id", { length: 256 }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    pestId: uuid("pest_id").notNull().references(() => desktopBasementPestsTable.id, { onDelete: "cascade" }),
    moveId: varchar("move_id", { length: 32 }).notNull(),
    damage: integer("damage").notNull(),
    staminaAfter: integer("stamina_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "desktop_basement_attack_events_id_pk", columns: [table.id] }),
    uniqueIndex("desktop_basement_attack_user_request_unique").on(table.userId, table.requestId),
    index("desktop_basement_attack_pest_created_idx").on(table.pestId, table.createdAt),
    check("desktop_basement_attack_damage_check", sql`${table.damage} between 0 and 100`),
    check("desktop_basement_attack_stamina_check", sql`${table.staminaAfter} between 0 and 100`),
  ],
);

export const towerBuildingVitalsTable = pgTable(
  "tower_building_vitals",
  {
    buildingKey: varchar("building_key", { length: 64 }).notNull().default("shadow_tower"),
    powerCondition: integer("power_condition").notNull().default(100),
    plumbingCondition: integer("plumbing_condition").notNull().default(100),
    upkeepCondition: integer("upkeep_condition").notNull().default(100),
    lastTickAt: timestamp("last_tick_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: varchar("updated_by_user_id", { length: 256 }).references(() => usersTable.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "tower_building_vitals_building_pk", columns: [table.buildingKey] }),
    check("tower_building_vitals_power_check", sql`${table.powerCondition} between 0 and 100`),
    check("tower_building_vitals_plumbing_check", sql`${table.plumbingCondition} between 0 and 100`),
    check("tower_building_vitals_upkeep_check", sql`${table.upkeepCondition} between 0 and 100`),
  ],
);
