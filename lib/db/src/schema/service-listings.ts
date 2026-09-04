import { pgTable, serial, varchar, integer, text, timestamp, index, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Internal services board — player-to-player and org-to-org gig economy.
 *
 * Any org or solo player can post a service listing with a pay amount held
 * in escrow. Another player claims the gig; the poster marks it complete
 * and escrow releases. If 48h passes without completion, either side can
 * dispute and escrow returns to both.
 */
export const serviceListingsTable = pgTable("service_listings", {
  id: serial("id").primaryKey(),

  // Poster identity
  posterUserId: varchar("poster_user_id", { length: 64 }).notNull(),
  posterName: varchar("poster_name", { length: 64 }).notNull(),
  posterOrgId: integer("poster_org_id"),
  posterOrgName: varchar("poster_org_name", { length: 128 }),

  // Gig details
  category: varchar("category", { length: 32 }).notNull().default("Other"),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  payFiat: integer("pay_fiat").notNull().default(0),
  payType: varchar("pay_type", { length: 8 }).notNull().default("flat"), // 'flat' | 'hourly'
  cityId: varchar("city_id", { length: 32 }).notNull().default("minx_prime"),
  location: varchar("location", { length: 32 }).notNull().default("city"), // 'city' | 'remote'
  deadline: timestamp("deadline", { withTimezone: true }),
  // Optional canonical Shadow Tower tenant scope. Null keeps legacy board gigs
  // visible on the shared Services Board.
  businessKey: varchar("business_key", { length: 64 }),

  // Lifecycle
  status: varchar("status", { length: 16 }).notNull().default("open"),
  // 'open' | 'claimed' | 'complete' | 'disputed' | 'cancelled'

  // Claimer
  claimerUserId: varchar("claimer_user_id", { length: 64 }),
  claimerName: varchar("claimer_name", { length: 64 }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  disputedAt: timestamp("disputed_at", { withTimezone: true }),

  // Escrow — debited from poster at claim, released to claimer on complete,
  // returned on dispute or cancellation.
  escrowFiat: integer("escrow_fiat").notNull().default(0),

  // After completion, has the poster/claimer been prompted for rating?
  posterRated: integer("poster_rated").notNull().default(0),    // 0 | 1
  claimerRated: integer("claimer_rated").notNull().default(0),  // 0 | 1

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStatus: index("svc_listings_status_idx").on(t.status),
  byCity: index("svc_listings_city_idx").on(t.cityId, t.status),
  byBusiness: index("svc_listings_business_idx").on(t.businessKey, t.status),
  byPoster: index("svc_listings_poster_idx").on(t.posterUserId),
  byClaimer: index("svc_listings_claimer_idx").on(t.claimerUserId),
}));

export const insertServiceListingSchema = createInsertSchema(serviceListingsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertServiceListing = z.infer<typeof insertServiceListingSchema>;
export type ServiceListing = typeof serviceListingsTable.$inferSelect;

/**
 * Ratings for completed service gigs.
 * Both poster (rating claimer's work quality) and claimer
 * (rating poster's responsiveness) leave a 1-5 star review.
 */
export const serviceRatingsTable = pgTable("service_ratings", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  raterUserId: varchar("rater_user_id", { length: 64 }).notNull(),
  rateeUserId: varchar("ratee_user_id", { length: 64 }).notNull(),
  stars: smallint("stars").notNull(), // 1-5
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byListing: index("svc_ratings_listing_idx").on(t.listingId),
  byRatee: index("svc_ratings_ratee_idx").on(t.rateeUserId),
}));

export const insertServiceRatingSchema = createInsertSchema(serviceRatingsTable).omit({
  id: true, createdAt: true,
});
export type InsertServiceRating = z.infer<typeof insertServiceRatingSchema>;
export type ServiceRating = typeof serviceRatingsTable.$inferSelect;
