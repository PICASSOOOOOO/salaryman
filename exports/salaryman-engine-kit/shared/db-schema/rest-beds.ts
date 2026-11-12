import { boolean, index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const REST_BED_TYPES = ["infirmary", "hotel", "hostel", "capsule", "other"] as const;

export const restBedsTable = pgTable("rest_beds", {
  id: serial("id").primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 256 }).notNull(),
  orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  cityId: varchar("city_id", { length: 40 }).notNull(),
  bedKey: varchar("bed_key", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  roomType: varchar("room_type", { length: 24 }).notNull().default("hotel"),
  description: varchar("description", { length: 300 }),
  hourlyRateFiat: integer("hourly_rate_fiat").notNull(),
  staminaPerHour: integer("stamina_per_hour").notNull().default(35),
  rechargeConsumables: boolean("recharge_consumables").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("rest_beds_bed_key_unique_idx").on(t.bedKey),
  index("rest_beds_city_active_idx").on(t.cityId, t.active),
  index("rest_beds_org_idx").on(t.orgId),
]);

export const restBedBookingsTable = pgTable("rest_bed_bookings", {
  id: serial("id").primaryKey(),
  bedId: integer("bed_id").notNull().references(() => restBedsTable.id, { onDelete: "cascade" }),
  renterUserId: varchar("renter_user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  requestId: varchar("request_id", { length: 80 }).notNull(),
  hours: integer("hours").notNull(),
  amountFiat: integer("amount_fiat").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rest_bed_bookings_request_unique_idx").on(t.renterUserId, t.requestId),
  index("rest_bed_bookings_bed_ends_idx").on(t.bedId, t.endsAt),
]);