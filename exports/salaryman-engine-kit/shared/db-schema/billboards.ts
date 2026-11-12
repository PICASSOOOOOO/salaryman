import { pgTable, serial, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billboardsTable = pgTable("billboards", {
  id: serial("id").primaryKey(),
  locationId: varchar("location_id", { length: 64 }).notNull().unique(),
  ownerPlayerName: varchar("owner_player_name", { length: 64 }),
  adText: text("ad_text"),
  adImageUrl: text("ad_image_url"),
  priceFlorin: integer("price_florin").notNull().default(10000),
  rentedUntil: timestamp("rented_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillboardSchema = createInsertSchema(billboardsTable).omit({ id: true, createdAt: true });
export type InsertBillboard = z.infer<typeof insertBillboardSchema>;
export type Billboard = typeof billboardsTable.$inferSelect;
