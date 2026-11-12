import { pgTable, serial, varchar, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cityBuildingsTable = pgTable("city_buildings", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id", { length: 256 }),
  ownerName: varchar("owner_name", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  buildingType: varchar("building_type", { length: 32 }).notNull().default("office"),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  w: integer("w").notNull().default(80),
  h: integer("h").notNull().default(60),
  color: varchar("color", { length: 20 }).notNull().default("#38bdf8"),
  label: varchar("label", { length: 40 }),
  description: text("description"),
  rentPrice: integer("rent_price").notNull().default(0),
  buildCost: integer("build_cost").notNull().default(0),
  tenantId: varchar("tenant_id", { length: 256 }),
  tenantName: varchar("tenant_name", { length: 64 }),
  isPublic: boolean("is_public").notNull().default(false),
  serverId: varchar("server_id", { length: 32 }).notNull().default("minx_prime"),
  demolished: boolean("demolished").notNull().default(false),
  conditionScore: integer("condition_score").notNull().default(100),
  conditionLastMaintainedAt: timestamp("condition_last_maintained_at", { withTimezone: true }).notNull().defaultNow(),
  conditionRepairCount: integer("condition_repair_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCityBuildingSchema = createInsertSchema(cityBuildingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCityBuilding = z.infer<typeof insertCityBuildingSchema>;
export type CityBuilding = typeof cityBuildingsTable.$inferSelect;
