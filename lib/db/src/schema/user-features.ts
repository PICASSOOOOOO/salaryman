import { pgTable, varchar, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const FEATURE_KEYS = ["live_listen", "screen_scan", "say_this", "phone_system", "claw_bot"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const userFeaturesTable = pgTable(
  "user_features",
  {
    userId: varchar("user_id").notNull(),
    featureKey: varchar("feature_key").notNull(),
    grantedBy: varchar("granted_by").notNull().default("stripe"),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.featureKey] })]
);

export type UserFeature = typeof userFeaturesTable.$inferSelect;
