import { pgTable, serial, varchar, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Debt-collector bounty contracts.
 *
 * An org admin (or any org in arrears) can post a bounty on a target player.
 * A player with Street Rep skill accepts the bounty and gets within 5 tiles
 * of the online target to "tag" them. On tag: escrow pays collector, bounty
 * marked collected, COMMS DMs go to all parties.
 *
 * Targets receive a threatening DM that a bounty exists on them but cannot
 * see who accepted it. Bounties expire after the poster's chosen window
 * (24h–7d). Poster can cancel before collection.
 */
export const debtBountiesTable = pgTable("debt_bounties", {
  id: serial("id").primaryKey(),

  // Who posted it
  posterUserId: varchar("poster_user_id", { length: 64 }).notNull(),
  posterName: varchar("poster_name", { length: 64 }).notNull(),
  posterOrgId: integer("poster_org_id"),

  // Who is being hunted
  targetUserId: varchar("target_user_id", { length: 64 }).notNull(),
  targetName: varchar("target_name", { length: 64 }).notNull(),

  // Bounty terms
  rewardFiat: integer("reward_fiat").notNull().default(500), // min 500ƒ
  escrowFiat: integer("escrow_fiat").notNull().default(0),
  description: text("description").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  // Lifecycle: 'active' | 'collected' | 'cancelled' | 'expired'
  status: varchar("status", { length: 16 }).notNull().default("active"),

  // The collector (accepted by one player at a time)
  acceptedByUserId: varchar("accepted_by_user_id", { length: 64 }),
  acceptedByName: varchar("accepted_by_name", { length: 64 }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStatus: index("bounties_status_idx").on(t.status),
  byTarget: index("bounties_target_idx").on(t.targetUserId),
  byPoster: index("bounties_poster_idx").on(t.posterUserId),
}));

export const insertDebtBountySchema = createInsertSchema(debtBountiesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertDebtBounty = z.infer<typeof insertDebtBountySchema>;
export type DebtBounty = typeof debtBountiesTable.$inferSelect;
