import { pgTable, serial, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformApiKeysTable = pgTable("platform_api_keys", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  keyHash: varchar("key_hash", { length: 512 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  scopes: jsonb("scopes").$type<string[]>().default([]),
  active: boolean("active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformWebhooksTable = pgTable("platform_webhooks", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().default([]),
  secret: varchar("secret", { length: 255 }),
  active: boolean("active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failCount: serial("fail_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformConnectedAppsTable = pgTable("platform_connected_apps", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id", { length: 255 }).notNull(),
  appSlug: varchar("app_slug", { length: 100 }).notNull(),
  appName: varchar("app_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("connected"),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformApiKeySchema = createInsertSchema(platformApiKeysTable).omit({ id: true, createdAt: true });
export type InsertPlatformApiKey = z.infer<typeof insertPlatformApiKeySchema>;
export type PlatformApiKey = typeof platformApiKeysTable.$inferSelect;

export const insertPlatformWebhookSchema = createInsertSchema(platformWebhooksTable).omit({ id: true, createdAt: true });
export type InsertPlatformWebhook = z.infer<typeof insertPlatformWebhookSchema>;
export type PlatformWebhook = typeof platformWebhooksTable.$inferSelect;

export type PlatformConnectedApp = typeof platformConnectedAppsTable.$inferSelect;
