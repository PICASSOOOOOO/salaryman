import { pgTable, serial, varchar, text, integer, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchProductsTable = pgTable("merch_products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  images: jsonb("images").notNull().default([]),
  sizes: jsonb("sizes").notNull().default([]),
  category: varchar("category", { length: 100 }).notNull().default("apparel"),
  active: boolean("active").notNull().default(true),
  stripePriceId: varchar("stripe_price_id", { length: 200 }),
  stripeProductId: varchar("stripe_product_id", { length: 200 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMerchProductSchema = createInsertSchema(merchProductsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchProduct = z.infer<typeof insertMerchProductSchema>;
export type MerchProduct = typeof merchProductsTable.$inferSelect;

export const merchOrdersTable = pgTable("merch_orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 300 }),
  stripeSessionId: varchar("stripe_session_id", { length: 500 }).notNull().unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 500 }),
  productId: integer("product_id").notNull(),
  productName: varchar("product_name", { length: 300 }).notNull(),
  size: varchar("size", { length: 50 }),
  quantity: integer("quantity").notNull().default(1),
  amountTotal: integer("amount_total").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("usd"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  shippingName: varchar("shipping_name", { length: 300 }),
  shippingEmail: varchar("shipping_email", { length: 300 }),
  shippingLine1: varchar("shipping_line1", { length: 500 }),
  shippingLine2: varchar("shipping_line2", { length: 500 }),
  shippingCity: varchar("shipping_city", { length: 200 }),
  shippingState: varchar("shipping_state", { length: 200 }),
  shippingPostalCode: varchar("shipping_postal_code", { length: 50 }),
  shippingCountry: varchar("shipping_country", { length: 10 }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("merch_orders_user_id_idx").on(table.userId),
  index("merch_orders_status_idx").on(table.status),
  index("merch_orders_stripe_session_idx").on(table.stripeSessionId),
]);

export const insertMerchOrderSchema = createInsertSchema(merchOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMerchOrder = z.infer<typeof insertMerchOrderSchema>;
export type MerchOrder = typeof merchOrdersTable.$inferSelect;
