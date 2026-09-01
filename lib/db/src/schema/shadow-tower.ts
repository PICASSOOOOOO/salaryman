import { pgTable, serial, varchar, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const shadowTowerFloorsTable = pgTable("shadow_tower_floors", {
  id: serial("id").primaryKey(),
  city: varchar("city", { length: 20 }).notNull(),
  floorNumber: integer("floor_number").notNull(),
  orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  ownerUserId: varchar("owner_user_id"),
  tenure: varchar("tenure", { length: 12 }).notNull(), // own | lease
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  archetype: varchar("archetype", { length: 24 }).notNull(),
  minAccessRole: varchar("min_access_role", { length: 20 }).notNull().default("specialist"),
  accessPermission: varchar("access_permission", { length: 60 }).notNull().default("org.settings"),
  passwordHash: varchar("password_hash", { length: 255 }),
  classification: varchar("classification", { length: 40 }).notNull().default("internal"),
  upgrades: jsonb("upgrades").$type<string[]>().notNull().default([]),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("shadow_tower_floors_city_number_unique").on(t.city, t.floorNumber),
  index("shadow_tower_floors_org_idx").on(t.orgId),
  index("shadow_tower_floors_personal_owner_idx").on(t.ownerUserId),
  index("shadow_tower_floors_lease_expiry_idx").on(t.leaseExpiresAt),
]);

export const shadowTowerWorkstationAssignmentsTable = pgTable("shadow_tower_workstation_assignments", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id").notNull().references(() => shadowTowerFloorsTable.id, { onDelete: "cascade" }),
  workstationKey: varchar("workstation_key", { length: 64 }).notNull(),
  assigneeType: varchar("assignee_type", { length: 12 }).notNull(), // human | bot
  assigneeUserId: varchar("assignee_user_id"),
  botId: integer("bot_id"),
  assignedByUserId: varchar("assigned_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("shadow_tower_assignment_station_unique").on(t.floorId, t.workstationKey),
  uniqueIndex("shadow_tower_assignment_human_unique").on(t.floorId, t.assigneeUserId),
  uniqueIndex("shadow_tower_assignment_bot_unique").on(t.floorId, t.botId),
  index("shadow_tower_assignment_floor_idx").on(t.floorId),
]);

/** Explicit per-player selection avoids ambiguous "first floor" office hydration. */
export const shadowTowerSelectedFloorsTable = pgTable("shadow_tower_selected_floors", {
  userId: varchar("user_id").primaryKey(),
  floorId: integer("floor_id").notNull().references(() => shadowTowerFloorsTable.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("shadow_tower_selected_floor_idx").on(t.floorId)]);

export type ShadowTowerFloor = typeof shadowTowerFloorsTable.$inferSelect;
export type ShadowTowerWorkstationAssignment = typeof shadowTowerWorkstationAssignmentsTable.$inferSelect;