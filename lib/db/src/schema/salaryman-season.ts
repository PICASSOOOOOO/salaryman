import { pgTable, serial, varchar, integer, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

export const salarymanSeasonsTable = pgTable("salaryman_seasons", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  number: integer("number").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  premiumPriceUsd: integer("premium_price_usd").notNull().default(999),
  stripePriceId: varchar("stripe_price_id", { length: 128 }),
  tiers: jsonb("tiers").notNull().$type<SeasonTier[]>(),
  missions: jsonb("missions").notNull().$type<SeasonMissionDef[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface SeasonTier {
  level: number;
  xpRequired: number;
  freeReward: SeasonReward | null;
  premiumReward: SeasonReward | null;
}

export type RewardKind = "fiat" | "cosmetic" | "title" | "item";

export interface SeasonReward {
  kind: RewardKind;
  label: string;
  value: number | string;
  color?: string;
  icon?: string;
}

export interface SeasonMissionDef {
  id: string;
  type: "daily" | "weekly";
  label: string;
  description: string;
  targetCount: number;
  xpReward: number;
  trackingKey: string;
}

export const salarymanPlayerPassTable = pgTable("salaryman_player_pass", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  seasonId: integer("season_id").notNull(),
  xp: integer("xp").notNull().default(0),
  currentLevel: integer("current_level").notNull().default(1),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumPurchasedAt: timestamp("premium_purchased_at", { withTimezone: true }),
  stripeSessionId: varchar("stripe_session_id", { length: 256 }),
  claimedTiers: jsonb("claimed_tiers").notNull().$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("salaryman_player_pass_user_season").on(t.userId, t.seasonId),
]);

export const salarymanPlayerMissionsTable = pgTable("salaryman_player_missions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  seasonId: integer("season_id").notNull(),
  missionId: varchar("mission_id", { length: 64 }).notNull(),
  periodKey: varchar("period_key", { length: 32 }).notNull(),
  progress: integer("progress").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  xpAwarded: boolean("xp_awarded").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("salaryman_player_missions_unique").on(t.userId, t.seasonId, t.missionId, t.periodKey),
]);

export type SalarymanSeason = typeof salarymanSeasonsTable.$inferSelect;
export type SalarymanPlayerPass = typeof salarymanPlayerPassTable.$inferSelect;
export type SalarymanPlayerMission = typeof salarymanPlayerMissionsTable.$inferSelect;
