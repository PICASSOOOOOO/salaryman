import { pgTable, serial, text, timestamp, integer, boolean, jsonb, varchar, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BOT_STATUSES = ["active", "paused", "error"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

export const PLATFORM_TYPES = ["telegram", "whatsapp", "discord", "slack", "sms", "email", "thinkorswim", "facebook", "linkedin"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

export const PERMISSION_KEYS = [
  "crm_read", "crm_write", "email_send", "calendar_read", "calendar_write",
  "documents_read", "contacts_read", "contacts_write", "ai_chat",
  "trading_read", "trading_execute", "trading_paper",
  "linkedin_outreach", "recruitment_manage",
  "phone_inbound", "phone_outbound",
  "sheets_read", "sheets_write",
  "music_generate", "audio_generate",
  "bot_management",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const TRADE_STRATEGY_TYPES = [
  "swing_trading", "day_trading", "scalping", "volume_trading", "momentum_trading",
  "covered_calls", "iron_condors", "vertical_spreads", "straddles",
] as const;
export type TradeStrategyType = (typeof TRADE_STRATEGY_TYPES)[number];

export const botTradeStrategiesTable = pgTable("bot_trade_strategies", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  strategyType: varchar("strategy_type", { length: 50 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
  maxDailyLoss: integer("max_daily_loss").notNull().default(500),
  maxDailyLossPercent: integer("max_daily_loss_percent").notNull().default(5),
  maxPositionSize: integer("max_position_size").notNull().default(1000),
  maxConcurrentTrades: integer("max_concurrent_trades").notNull().default(3),
  stopLossPercent: integer("stop_loss_percent").notNull().default(2),
  trailingStopPercent: integer("trailing_stop_percent").notNull().default(0),
  killSwitch: boolean("kill_switch").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertBotTradeStrategySchema = createInsertSchema(botTradeStrategiesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type BotTradeStrategy = typeof botTradeStrategiesTable.$inferSelect;
export type InsertBotTradeStrategy = ReturnType<typeof insertBotTradeStrategySchema.parse>;

export const botTradeLogTable = pgTable("bot_trade_log", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  strategyType: varchar("strategy_type", { length: 50 }).notNull(),
  symbol: text("symbol").notNull(),
  side: varchar("side", { length: 10 }).notNull(),
  quantity: integer("quantity").notNull(),
  entryPrice: integer("entry_price").notNull(),
  exitPrice: integer("exit_price"),
  pnl: integer("pnl"),
  isPaper: boolean("is_paper").notNull().default(true),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  orderId: text("order_id"),
  assetType: varchar("asset_type", { length: 10 }).notNull().default("EQUITY"),
  peakPrice: integer("peak_price"),
  signal: jsonb("signal").$type<Record<string, unknown>>().notNull().default({}),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotTradeLogSchema = createInsertSchema(botTradeLogTable).omit({
  id: true, createdAt: true,
});
export type BotTradeLog = typeof botTradeLogTable.$inferSelect;
export type InsertBotTradeLog = ReturnType<typeof insertBotTradeLogSchema.parse>;

export const botTradingAccountsTable = pgTable("bot_trading_accounts", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }).unique(),
  schwabAccountHash: text("schwab_account_hash"),
  schwabAccountNumber: text("schwab_account_number"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  isPaperMode: boolean("is_paper_mode").notNull().default(true),
  cachedBalance: integer("cached_balance"),
  cachedEquity: integer("cached_equity"),
  dailyPnl: integer("daily_pnl").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertBotTradingAccountSchema = createInsertSchema(botTradingAccountsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type BotTradingAccount = typeof botTradingAccountsTable.$inferSelect;
export type InsertBotTradingAccount = ReturnType<typeof insertBotTradingAccountSchema.parse>;

// Broker-agnostic connection records. Unlike botTradingAccountsTable (which is
// Schwab-specific and one-per-bot for backward compatibility), a bot can hold
// multiple broker connections at once (e.g. Schwab + Alpaca + IBKR), each with
// its own credentials, paper/live flag and native account currency.
export const BROKER_IDS = [
  "schwab", "alpaca", "ibkr", "ssi", "japan", "europe",
] as const;
export type BrokerId = (typeof BROKER_IDS)[number];

export const botBrokerConnectionsTable = pgTable(
  "bot_broker_connections",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
    broker: varchar("broker", { length: 30 }).notNull(),
    label: text("label"),
    encryptedCredentials: text("encrypted_credentials"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    isPaperMode: boolean("is_paper_mode").notNull().default(true),
    // ISO 4217 native account currency (USD, JPY, EUR, GBP, VND, ...).
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    accountIdentifier: text("account_identifier"),
    // Cached balances expressed in the native currency's minor unit × 100
    // (same "cents" convention used elsewhere), so JPY/VND stay integer-safe.
    cachedBalanceNative: integer("cached_balance_native"),
    cachedEquityNative: integer("cached_equity_native"),
    dailyPnlNative: integer("daily_pnl_native").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("connected"),
    isDefault: boolean("is_default").notNull().default(false),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("bot_broker_connections_bot_broker_idx").on(t.botId, t.broker)]
);

export const insertBotBrokerConnectionSchema = createInsertSchema(botBrokerConnectionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type BotBrokerConnection = typeof botBrokerConnectionsTable.$inferSelect;
export type InsertBotBrokerConnection = ReturnType<typeof insertBotBrokerConnectionSchema.parse>;

// Optional, user-supplied third-party market-data provider key (Polygon /
// Twelve Data / Finnhub). The user signs up and pays for it themselves; we just
// store the encrypted key so the bot can fetch richer/international data. One
// active provider per user — the system degrades gracefully when absent.
export const MARKET_DATA_PROVIDERS = ["polygon", "twelvedata", "finnhub"] as const;
export type MarketDataProviderId = (typeof MARKET_DATA_PROVIDERS)[number];

export const tradingDataProvidersTable = pgTable(
  "trading_data_providers",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("trading_data_providers_user_idx").on(t.userId)]
);

export const insertTradingDataProviderSchema = createInsertSchema(tradingDataProvidersTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type TradingDataProvider = typeof tradingDataProvidersTable.$inferSelect;
export type InsertTradingDataProvider = ReturnType<typeof insertTradingDataProviderSchema.parse>;

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  orgId: integer("org_id"),
  name: text("name").notNull(),
  personality: text("personality").notNull().default("You are a helpful assistant."),
  systemPrompt: text("system_prompt").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("paused"),
  permissions: jsonb("permissions").$type<PermissionKey[]>().notNull().default(["ai_chat"]),
  maxTokensPerResponse: integer("max_tokens_per_response").notNull().default(4096),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(10),
  marketplaceItemId: integer("marketplace_item_id"),
  collaborationEnabled: boolean("collaboration_enabled").notNull().default(false),
  parentBotId: integer("parent_bot_id"),
  collaborationRole: varchar("collaboration_role", { length: 40 }),
  // Groups bots by similar job so the roster can show them on teams
  // (e.g. "marketing", "sales", "trading", "support", "creative").
  department: varchar("department", { length: 40 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => [
  // PostgreSQL permits multiple NULL values, so custom bots remain unlimited
  // while a user can own only one instance of each marketplace template.
  uniqueIndex("bots_owner_marketplace_item_idx").on(t.ownerId, t.marketplaceItemId),
]);

export const insertBotSchema = createInsertSchema(botsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type Bot = typeof botsTable.$inferSelect;
export type InsertBot = z.infer<typeof insertBotSchema>;

export const BOT_DIRECTIVE_SCOPES = ["all", "specific"] as const;
export type BotDirectiveScope = (typeof BOT_DIRECTIVE_SCOPES)[number];

export const BOT_DIRECTIVE_STATUSES = ["active", "rescinded", "expired"] as const;
export type BotDirectiveStatus = (typeof BOT_DIRECTIVE_STATUSES)[number];

export const botDirectivesTable = pgTable("bot_directives", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  issuedBy: varchar("issued_by").notNull(),
  message: text("message").notNull(),
  scope: varchar("scope", { length: 20 }).notNull().default("all"),
  targetBotIds: jsonb("target_bot_ids").$type<number[]>().notNull().default([]),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertBotDirectiveSchema = createInsertSchema(botDirectivesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BotDirective = typeof botDirectivesTable.$inferSelect;
export type InsertBotDirective = z.infer<typeof insertBotDirectiveSchema>;

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
}, (t) => [
  uniqueIndex("bot_scheduled_tasks_bot_id_description_idx").on(t.botId, t.taskDescription),
]);

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

export const CONTENT_RATINGS = ["sfw", "mature", "adult"] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

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
  contentRating: varchar("content_rating", { length: 20 }).notNull().default("sfw"),
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
    orgId: integer("org_id"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.marketplaceItemId] })]
);

export type BotSubscription = typeof botSubscriptionsTable.$inferSelect;

export const botOAuthSessionsTable = pgTable("bot_oauth_sessions", {
  nonce: varchar("nonce", { length: 64 }).primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BotOAuthSession = typeof botOAuthSessionsTable.$inferSelect;
