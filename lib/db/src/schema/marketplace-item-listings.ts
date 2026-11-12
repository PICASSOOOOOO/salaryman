import { pgTable, serial, varchar, integer, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Player-owned items escrowed on the unified marketplace until sale/cancellation.
 */
export const marketplaceItemListingsTable = pgTable("marketplace_item_listings", {
  id: serial("id").primaryKey(),
  sellerId: varchar("seller_id", { length: 256 }).notNull(),
  sellerSlot: integer("seller_slot").notNull().default(0),
  sellerName: varchar("seller_name", { length: 64 }).notNull(),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  itemName: varchar("item_name", { length: 120 }).notNull(),
  quantity: integer("quantity").notNull(),
  priceFiat: integer("price_fiat").notNull(),
  cityId: varchar("city_id", { length: 32 }).notNull().default("minx_prime"),
  description: text("description").notNull().default(""),
  artKey: varchar("art_key", { length: 256 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  escrowed: boolean("escrowed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("marketplace_item_listings_status_idx").on(t.status, t.createdAt),
  index("marketplace_item_listings_city_idx").on(t.cityId, t.status),
  index("marketplace_item_listings_seller_idx").on(t.sellerId, t.status),
  index("marketplace_item_listings_item_idx").on(t.itemId, t.status),
]);

export const insertMarketplaceItemListingSchema = createInsertSchema(marketplaceItemListingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMarketplaceItemListing = z.infer<typeof insertMarketplaceItemListingSchema>;
export type MarketplaceItemListing = typeof marketplaceItemListingsTable.$inferSelect;