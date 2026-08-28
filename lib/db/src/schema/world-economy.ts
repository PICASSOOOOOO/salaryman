import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const worldJobRunsTable = pgTable("world_job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  jobId: varchar("job_id", { length: 64 }).notNull(),
  buildingId: varchar("building_id", { length: 64 }).notNull(),
  label: varchar("label", { length: 96 }).notNull(),
  payFiat: integer("pay_fiat").notNull(),
  durationMs: integer("duration_ms").notNull(),
  cooldownMs: integer("cooldown_ms").notNull(),
  startIdempotencyKey: varchar("start_idempotency_key", { length: 128 }).notNull(),
  completeIdempotencyKey: varchar("complete_idempotency_key", { length: 128 }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completesAt: timestamp("completes_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
}, (t) => ({
  userSlotIdx: index("world_job_runs_user_slot_idx").on(t.userId, t.slotIndex, t.startedAt),
  startIdempotencyUnique: uniqueIndex("world_job_runs_start_idem_uq").on(t.userId, t.slotIndex, t.startIdempotencyKey),
  completeIdempotencyUnique: uniqueIndex("world_job_runs_complete_idem_uq").on(t.userId, t.slotIndex, t.completeIdempotencyKey),
  oneActiveRun: uniqueIndex("world_job_runs_one_active_uq")
    .on(t.userId, t.slotIndex)
    .where(sql`${t.completedAt} is null`),
}));

export const worldCargoTable = pgTable("world_cargo", {
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  commodityId: varchar("commodity_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: "world_cargo_pk", columns: [t.userId, t.slotIndex, t.commodityId] }),
  userSlotIdx: index("world_cargo_user_slot_idx").on(t.userId, t.slotIndex),
  quantityCheck: check("world_cargo_quantity_check", sql`${t.quantity} >= 0`),
}));

export const worldMarketQuotesTable = pgTable("world_market_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull(),
  location: varchar("location", { length: 16 }).notNull(),
  commodityId: varchar("commodity_id", { length: 64 }).notNull(),
  side: varchar("side", { length: 8 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceFiat: integer("unit_price_fiat").notNull(),
  totalFiat: integer("total_fiat").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  executionIdempotencyKey: varchar("execution_idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userSlotIdx: index("world_market_quotes_user_slot_idx").on(t.userId, t.slotIndex, t.createdAt),
  executionIdempotencyUnique: uniqueIndex("world_market_quotes_execute_idem_uq")
    .on(t.userId, t.slotIndex, t.executionIdempotencyKey),
  quantityCheck: check("world_market_quotes_quantity_check", sql`${t.quantity} > 0`),
  sideCheck: check("world_market_quotes_side_check", sql`${t.side} in ('buy', 'sell')`),
  locationCheck: check("world_market_quotes_location_check", sql`${t.location} in ('city', 'waste')`),
}));

export const worldPlayerPositionsTable = pgTable("world_player_positions", {
  userId: varchar("user_id", { length: 256 }).notNull(),
  cityId: varchar("city_id", { length: 40 }).notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: "world_player_positions_pk", columns: [t.userId, t.cityId] }),
  updatedIdx: index("world_player_positions_updated_idx").on(t.updatedAt),
}));

export const worldJobRunRelations = relations(worldJobRunsTable, () => ({}));
export const worldCargoRelations = relations(worldCargoTable, () => ({}));
export const worldMarketQuoteRelations = relations(worldMarketQuotesTable, () => ({}));
export const worldPlayerPositionRelations = relations(worldPlayerPositionsTable, () => ({}));

export const insertWorldJobRunSchema = createInsertSchema(worldJobRunsTable).omit({ id: true, startedAt: true });
export const insertWorldCargoSchema = createInsertSchema(worldCargoTable).omit({ updatedAt: true });
export const insertWorldMarketQuoteSchema = createInsertSchema(worldMarketQuotesTable).omit({ id: true, createdAt: true });
export const insertWorldPlayerPositionSchema = createInsertSchema(worldPlayerPositionsTable).omit({ updatedAt: true });
export type WorldJobRun = typeof worldJobRunsTable.$inferSelect;
export type WorldCargo = typeof worldCargoTable.$inferSelect;
export type WorldMarketQuote = typeof worldMarketQuotesTable.$inferSelect;
export type WorldPlayerPosition = typeof worldPlayerPositionsTable.$inferSelect;
export type InsertWorldJobRun = z.infer<typeof insertWorldJobRunSchema>;
export type InsertWorldCargo = z.infer<typeof insertWorldCargoSchema>;
export type InsertWorldMarketQuote = z.infer<typeof insertWorldMarketQuoteSchema>;
export type InsertWorldPlayerPosition = z.infer<typeof insertWorldPlayerPositionSchema>;