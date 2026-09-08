import { pgTable, serial, varchar, integer, timestamp, jsonb, numeric, date, index, unique } from "drizzle-orm/pg-core";

// ── Resource nodes ────────────────────────────────────────────────────────
// Static seed positions for harvestable resource nodes across the world.
// Nodes respawn 20 min after last harvest. Max 3 concurrent harvesters.
export const resourceNodesTable = pgTable("resource_nodes", {
  id: serial("id").primaryKey(),
  resourceId: varchar("resource_id", { length: 64 }).notNull(),
  worldX: integer("world_x").notNull(),
  worldY: integer("world_y").notNull(),
  cityId: varchar("city_id", { length: 32 }).notNull().default("minx_prime"),
  lastHarvestedAt: timestamp("last_harvested_at", { withTimezone: true }),
  activeHarvesters: jsonb("active_harvesters").notNull().$type<string[]>().default([]),
}, (t) => [
  index("resource_nodes_city_idx").on(t.cityId),
]);

export type ResourceNode = typeof resourceNodesTable.$inferSelect;

// ── Resource inventory ─────────────────────────────────────────────────────
// Simple per-user, per-resource quantity ledger (no slot management needed).
export const resourceInventoryTable = pgTable("resource_inventory", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  resourceId: varchar("resource_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("resource_inventory_user_resource").on(t.userId, t.resourceId),
  index("resource_inventory_user_idx").on(t.userId),
]);

export type ResourceInventoryRow = typeof resourceInventoryTable.$inferSelect;

// ── Commodity prices ───────────────────────────────────────────────────────
// Daily buy prices at The Assay Office. Seeded once per calendar day.
// Price = base_price * (1 + random ±15% fluctuation).
export const commodityPricesTable = pgTable("commodity_prices", {
  id: serial("id").primaryKey(),
  resourceId: varchar("resource_id", { length: 64 }).notNull(),
  priceFiat: integer("price_fiat").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("commodity_prices_resource_date").on(t.resourceId, t.effectiveDate),
  index("commodity_prices_date_idx").on(t.effectiveDate),
]);

export type CommodityPrice = typeof commodityPricesTable.$inferSelect;

// ── Resource market listings ───────────────────────────────────────────────
// Player-to-player listings for raw materials on the Business Marketplace.
export const resourceListingsTable = pgTable("resource_listings", {
  id: serial("id").primaryKey(),
  sellerId: varchar("seller_id", { length: 256 }).notNull(),
  sellerName: varchar("seller_name", { length: 64 }).notNull().default(""),
  resourceId: varchar("resource_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull(),
  pricePerUnit: integer("price_per_unit").notNull(),
  cityId: varchar("city_id", { length: 32 }).notNull().default("minx_prime"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  buyerId: varchar("buyer_id", { length: 256 }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("resource_listings_seller_idx").on(t.sellerId),
  index("resource_listings_status_idx").on(t.status),
]);

export type ResourceListing = typeof resourceListingsTable.$inferSelect;
