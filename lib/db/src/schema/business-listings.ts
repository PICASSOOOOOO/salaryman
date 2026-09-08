import { pgTable, serial, varchar, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Business marketplace listings — the "for sale / for lease" board for in-game
 * DIGITAL businesses, modelled on the real-estate marketplace (digital
 * property). A listing is a going concern (SaaS, storefront, agency, content
 * channel, etc.) that a player is selling outright or leasing out.
 *
 * Valuation is revenue-multiple based: a business throws off
 * `monthlyIncomeFiat` per month, and its sale price is a multiple of that
 * income (priceFiat), while a lease charges `monthlyLeaseFiat` per month for
 * the operating rights. Mirrors how `real_estate_listings` works so the two
 * markets feel like one economy.
 *
 * Art (artUrl) is generated asynchronously by the Nano Banana service when the
 * listing is created. While queued/in-progress `artStatus` is "pending" and the
 * client shows a placeholder.
 */
export const businessListingsTable = pgTable("business_listings", {
  id: serial("id").primaryKey(),
  serverId: varchar("server_id", { length: 32 }).notNull().default("minx_prime"),
  sellerId: varchar("seller_id", { length: 256 }).notNull(),
  sellerName: varchar("seller_name", { length: 64 }).notNull(),
  // Which save slot the seller listed from — used to credit the sale proceeds
  // back to the right character when the listing sells.
  sellerSlot: integer("seller_slot").notNull().default(0),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  listingType: varchar("listing_type", { length: 16 }).notNull().default("sale"), // 'sale' | 'lease'
  category: varchar("category", { length: 32 }).notNull().default("saas"),
  // Pricing (revenue-multiple model)
  priceFiat: integer("price_fiat").notNull().default(0),
  monthlyLeaseFiat: integer("monthly_lease_fiat").notNull().default(0),
  monthlyIncomeFiat: integer("monthly_income_fiat").notNull().default(0),
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
  byServerStatus: index("biz_listings_server_status_idx").on(t.serverId, t.status),
  bySeller: index("biz_listings_seller_idx").on(t.sellerId),
}));

export const insertBusinessListingSchema = createInsertSchema(businessListingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  soldAt: true,
});
export type InsertBusinessListing = z.infer<typeof insertBusinessListingSchema>;
export type BusinessListing = typeof businessListingsTable.$inferSelect;
