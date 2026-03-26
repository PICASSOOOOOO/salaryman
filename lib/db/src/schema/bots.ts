import { pgTable, serial, text, timestamp, integer, boolean, jsonb, varchar, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BOT_STATUSES = ["active", "paused", "error"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

export const PLATFORM_TYPES = ["telegram", "whatsapp", "discord", "slack", "sms", "email"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

export const PERMISSION_KEYS = [
  "crm_read", "crm_write", "email_send", "calendar_read", "calendar_write",
  "documents_read", "contacts_read", "contacts_write", "ai_chat",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  name: text("name").notNull(),
  personality: text("personality").notNull().default("You are a helpful assistant."),
  systemPrompt: text("system_prompt").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  permissions: jsonb("permissions").$type<PermissionKey[]>().notNull().default(["ai_chat"]),
  maxTokensPerResponse: integer("max_tokens_per_response").notNull().default(4096),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(10),
  marketplaceItemId: integer("marketplace_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Bot = typeof botsTable.$inferSelect;
export type InsertBot = z.infer<typeof insertBotSchema>;

export const botPlatformConnectionsTable = pgTable("bot_platform_connections", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 20 }).notNull(),
  credentials: text("credentials").notNull().default(""),
  webhookSecret: text("webhook_secret"),
  webhookUrl: text("webhook_url"),
  status: varchar("status", { length: 20 }).notNull().default("disconnected"),
  externalBotId: text("external_bot_id"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotPlatformConnectionSchema = createInsertSchema(botPlatformConnectionsTable).omit({
  id: true,
  createdAt: true,
});
export type BotPlatformConnection = typeof botPlatformConnectionsTable.$inferSelect;
export type InsertBotPlatformConnection = z.infer<typeof insertBotPlatformConnectionSchema>;

export const botMemoryTable = pgTable("bot_memory", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertBotMemorySchema = createInsertSchema(botMemoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BotMemory = typeof botMemoryTable.$inferSelect;
export type InsertBotMemory = z.infer<typeof insertBotMemorySchema>;

export const botScheduledTasksTable = pgTable("bot_scheduled_tasks", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  taskDescription: text("task_description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotScheduledTaskSchema = createInsertSchema(botScheduledTasksTable).omit({
  id: true,
  createdAt: true,
});
export type BotScheduledTask = typeof botScheduledTasksTable.$inferSelect;
export type InsertBotScheduledTask = z.infer<typeof insertBotScheduledTaskSchema>;

export const botConversationLogsTable = pgTable("bot_conversation_logs", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 20 }).notNull(),
  externalUserId: text("external_user_id"),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotConversationLogSchema = createInsertSchema(botConversationLogsTable).omit({
  id: true,
  createdAt: true,
});
export type BotConversationLog = typeof botConversationLogsTable.$inferSelect;
export type InsertBotConversationLog = z.infer<typeof insertBotConversationLogSchema>;

export const botMarketplaceTable = pgTable("bot_marketplace", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  personality: text("personality").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  icon: varchar("icon", { length: 50 }).notNull().default("bot"),
  priceMonthly: integer("price_monthly").notNull().default(0),
  permissions: jsonb("permissions").$type<PermissionKey[]>().notNull().default(["ai_chat"]),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotMarketplaceSchema = createInsertSchema(botMarketplaceTable).omit({
  id: true,
  createdAt: true,
});
export type BotMarketplaceItem = typeof botMarketplaceTable.$inferSelect;
export type InsertBotMarketplaceItem = z.infer<typeof insertBotMarketplaceSchema>;

export const botSubscriptionsTable = pgTable(
  "bot_subscriptions",
  {
    userId: varchar("user_id").notNull(),
    marketplaceItemId: integer("marketplace_item_id").notNull().references(() => botMarketplaceTable.id),
    botId: integer("bot_id").references(() => botsTable.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.marketplaceItemId] })]
);

export type BotSubscription = typeof botSubscriptionsTable.$inferSelect;
