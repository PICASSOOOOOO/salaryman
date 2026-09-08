import { pgTable, serial, varchar, integer, boolean, timestamp, text, unique } from "drizzle-orm/pg-core";

export const cosmeticCatalogTable = pgTable("cosmetic_catalog", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  description: text("description").notNull(),
  priceCrypto: integer("price_crypto").notNull(),
  rarity: varchar("rarity", { length: 16 }).notNull().default("common"),
  colorHex: varchar("color_hex", { length: 16 }),
  iconEmoji: varchar("icon_emoji", { length: 8 }),
  active: boolean("active").notNull().default(true),
});

export const playerCosmeticsTable = pgTable("player_cosmetics", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  cosmeticId: varchar("cosmetic_id", { length: 64 }).notNull(),
  equipped: boolean("equipped").notNull().default(false),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("player_cosmetics_user_item").on(t.userId, t.cosmeticId)]);

export const cryptoPurchasesTable = pgTable("crypto_purchases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  bundleId: varchar("bundle_id", { length: 64 }).notNull(),
  cryptoAmount: integer("crypto_amount").notNull(),
  amountCents: integer("amount_cents").notNull(),
  stripeSessionId: varchar("stripe_session_id", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerCryptoBalanceTable = pgTable("player_crypto_balance", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull().unique(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CosmeticCatalog = typeof cosmeticCatalogTable.$inferSelect;
export type PlayerCosmetic = typeof playerCosmeticsTable.$inferSelect;
export type CryptoPurchase = typeof cryptoPurchasesTable.$inferSelect;
export type PlayerCryptoBalance = typeof playerCryptoBalanceTable.$inferSelect;
