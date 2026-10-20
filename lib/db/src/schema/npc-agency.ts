import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/** Brand factions are shared world data, never user- or organization-scoped. */
export const brandFactionsTable = pgTable("brand_factions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBrandFactionSchema = createInsertSchema(brandFactionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBrandFaction = z.infer<typeof insertBrandFactionSchema>;
export type BrandFactionRecord = typeof brandFactionsTable.$inferSelect;

/** Every physical shop location has one boss under its shared brand faction. */
export const shopLocationBossesTable = pgTable("shop_location_bosses", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  brandId: varchar("brand_id", { length: 128 })
    .notNull()
    .references(() => brandFactionsTable.id, { onDelete: "restrict" }),
  shopId: varchar("shop_id", { length: 128 }).notNull(),
  locationId: varchar("location_id", { length: 128 }).notNull(),
  netWorthFiat: bigint("net_worth_fiat", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("shop_location_bosses_location_unique_idx").on(t.locationId),
  index("shop_location_bosses_brand_shop_idx").on(t.brandId, t.shopId),
  check("shop_location_bosses_net_worth_nonnegative", sql`${t.netWorthFiat} >= 0`),
]);

export const insertShopLocationBossSchema = createInsertSchema(shopLocationBossesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertShopLocationBoss = z.infer<typeof insertShopLocationBossSchema>;
export type ShopLocationBossRecord = typeof shopLocationBossesTable.$inferSelect;
