import { pgTable, serial, varchar, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Recipient-addressed referral invites. An existing player invites someone
 * from outside the game via email or SMS; each invite carries a unique token
 * + link. When the invited person signs in for the first time the invite is
 * marked accepted and both parties receive a one-time ƒ reward.
 *
 * Anti-abuse:
 *   - One invite row per (inviter, channel, target) — re-inviting the same
 *     address is deduped at send time, so the inviter is rewarded at most once
 *     per unique invited email/number.
 *   - `invitedUserId` is the new player who accepted; a given user can only be
 *     attributed as someone's referral once (guarded in application logic).
 *   - `inviterRewardGranted` / `inviteeRewardGranted` make reward payout
 *     idempotent so a retry / double-accept never pays twice.
 */
export const referralInvitesTable = pgTable(
  "referral_invites",
  {
    id: serial("id").primaryKey(),
    inviterUserId: varchar("inviter_user_id", { length: 64 }).notNull(),
    // "email" or "sms"
    channel: varchar("channel", { length: 8 }).notNull(),
    // Normalized lowercase email (email channel) — null for sms invites.
    targetEmail: varchar("target_email", { length: 200 }),
    // E.164 phone (sms channel) — null for email invites.
    targetPhone: varchar("target_phone", { length: 24 }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    note: text("note"),
    // "sent" | "accepted"
    status: varchar("status", { length: 16 }).notNull().default("sent"),
    // The user who accepted this invite (set on conversion).
    invitedUserId: varchar("invited_user_id", { length: 64 }),
    inviterRewardGranted: boolean("inviter_reward_granted").notNull().default(false),
    inviteeRewardGranted: boolean("invitee_reward_granted").notNull().default(false),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    inviterIdx: index("referral_invites_inviter_idx").on(t.inviterUserId),
    tokenIdx: index("referral_invites_token_idx").on(t.token),
    targetEmailIdx: index("referral_invites_target_email_idx").on(t.targetEmail),
    targetPhoneIdx: index("referral_invites_target_phone_idx").on(t.targetPhone),
    invitedUserIdx: index("referral_invites_invited_user_idx").on(t.invitedUserId),
    // One invite per (inviter, email/phone) — DB-level dedupe so an inviter is
    // rewarded at most once per unique invited address even under concurrency.
    uniqInviterEmail: uniqueIndex("referral_invites_uniq_inviter_email")
      .on(t.inviterUserId, t.targetEmail)
      .where(sql`${t.targetEmail} IS NOT NULL`),
    uniqInviterPhone: uniqueIndex("referral_invites_uniq_inviter_phone")
      .on(t.inviterUserId, t.targetPhone)
      .where(sql`${t.targetPhone} IS NOT NULL`),
    // A person can only ever be attributed as one inviter's referral — DB-level
    // backstop for the application's one-attribution-per-user guarantee.
    uniqInvitedUser: uniqueIndex("referral_invites_uniq_invited_user")
      .on(t.invitedUserId)
      .where(sql`${t.invitedUserId} IS NOT NULL`),
  }),
);

export const insertReferralInviteSchema = createInsertSchema(referralInvitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReferralInvite = z.infer<typeof insertReferralInviteSchema>;
export type ReferralInvite = typeof referralInvitesTable.$inferSelect;
