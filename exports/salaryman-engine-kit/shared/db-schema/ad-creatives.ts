import { pgTable, serial, varchar, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AD_PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const AD_STATUSES = ["draft", "ready", "posted", "archived"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const adCreativesTable = pgTable("ad_creatives", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  orgId: integer("org_id"),
  botId: integer("bot_id"),
  botName: text("bot_name"),
  platform: varchar("platform", { length: 20 }).notNull(),
  brief: text("brief").notNull().default(""),
  headline: text("headline").notNull().default(""),
  primaryText: text("primary_text").notNull().default(""),
  cta: text("cta").notNull().default(""),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  imageUrl: text("image_url"),
  imageFileId: integer("image_file_id"),
  dimensions: varchar("dimensions", { length: 20 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertAdCreativeSchema = createInsertSchema(adCreativesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AdCreative = typeof adCreativesTable.$inferSelect;
export type InsertAdCreative = z.infer<typeof insertAdCreativeSchema>;
