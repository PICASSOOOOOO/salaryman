import { pgTable, serial, varchar, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Real-estate marketplace listings.
 *
 * A listing is a building (or vacant plot) that is currently for sale or for
 * rent in the in-game market. Listings reference a building in city_buildings
 * via `buildingId` when one exists; otherwise the listing represents a
 * promised plot that gets minted on purchase.
 *
 * Art (artUrl) is generated asynchronously by the Nano Banana service when
 * the listing is created. While the art is queued/in-progress, `artStatus`
 * is "pending" and the client can show a placeholder.
 */
export const realEstateListingsTable = pgTable("real_estate_listings", {
  id: serial("id").primaryKey(),
  serverId: varchar("server_id", { length: 32 }).notNull().default("minx_prime"),
  buildingId: integer("building_id"),
  sellerId: varchar("seller_id", { length: 256 }).notNull(),
  sellerName: varchar("seller_name", { length: 64 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  listingType: varchar("listing_type", { length: 16 }).notNull().default("sale"), // 'sale' | 'rent'
  propertyType: varchar("property_type", { length: 32 }).notNull().default("office"),
  // Pricing
  priceFiat: integer("price_fiat").notNull().default(0),
  monthlyRentFiat: integer("monthly_rent_fiat").notNull().default(0),
  // Geometry / footprint
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  w: integer("w").notNull().default(80),
  h: integer("h").notNull().default(60),
  sqft: integer("sqft").notNull().default(0),
  // Status / lifecycle
  status: varchar("status", { length: 16 }).notNull().default("active"), // 'active' | 'sold' | 'leased' | 'cancelled'
  buyerId: varchar("buyer_id", { length: 256 }),
  buyerName: varchar("buyer_name", { length: 64 }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  // Art (Nano Banana generated)
  artUrl: text("art_url"),
  artStatus: varchar("art_status", { length: 16 }).notNull().default("pending"), // 'pending' | 'ready' | 'failed'
  artTaskId: varchar("art_task_id", { length: 64 }),
  // Metadata
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byServerStatus: index("re_listings_server_status_idx").on(t.serverId, t.status),
  bySeller: index("re_listings_seller_idx").on(t.sellerId),
}));

export const insertRealEstateListingSchema = createInsertSchema(realEstateListingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  soldAt: true,
});
export type InsertRealEstateListing = z.infer<typeof insertRealEstateListingSchema>;
export type RealEstateListing = typeof realEstateListingsTable.$inferSelect;
