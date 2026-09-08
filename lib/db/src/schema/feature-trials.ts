import { pgTable, varchar, timestamp, serial, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const featureTrialsTable = pgTable("feature_trials", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  featureKey: varchar("feature_key", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 255 }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull().defaultNow(),
  trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }).notNull(),
  trialDays: integer("trial_days").notNull().default(7),
  source: varchar("source", { length: 128 }).notNull().default("feature_trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_feature_trials_email_feature").on(t.email, t.featureKey),
]);

export type FeatureTrial = typeof featureTrialsTable.$inferSelect;
