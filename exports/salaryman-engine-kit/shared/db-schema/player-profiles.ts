import { pgTable, varchar, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

/**
 * playerProfilesTable — multiple character profiles per authenticated user.
 *
 * One Replit-Auth account (one email) can spawn many in-game characters
 * (a.k.a. "saves" or "profiles"). All world data is keyed by `playerName`,
 * so a profile's `playerName` is the join key into world_businesses,
 * business_snapshots, business_transactions, etc.
 *
 * The currently selected profile is recorded on `users.active_profile_id`.
 * derivePlayerName() in routes/world.ts resolves that id → playerName so
 * every world route reads/writes the active character's data.
 */
export const playerProfilesTable = pgTable("player_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  playerName: varchar("player_name", { length: 32 }).notNull(),
  avatarColor: varchar("avatar_color", { length: 16 }).notNull().default("#a78bfa"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  responderCount: integer("responder_count").notNull().default(0),
  emergencyEarnings: integer("emergency_earnings").notNull().default(0),
}, (t) => [
  // Per-account uniqueness on uppercase playerName so two profiles on the
  // same account can't share a name (which would make world data ambiguous).
  uniqueIndex("player_profiles_user_name_unique").on(t.userId, t.playerName),
  // GLOBAL uniqueness on playerName as well — world tables (world_businesses,
  // business_snapshots, business_transactions, …) key off bare playerName,
  // so two accounts owning the same playerName would step on each other's
  // data. Enforce here at insert-time rather than refactor every world query.
  uniqueIndex("player_profiles_name_global_unique").on(t.playerName),
  index("player_profiles_user_idx").on(t.userId),
]);

export const insertPlayerProfileSchema = createInsertSchema(playerProfilesTable).omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertPlayerProfile = z.infer<typeof insertPlayerProfileSchema>;
export type PlayerProfile = typeof playerProfilesTable.$inferSelect;
