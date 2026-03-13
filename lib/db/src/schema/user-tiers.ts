import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

export const userTiersTable = pgTable("user_tiers", {
  userId: varchar("user_id").primaryKey(),
  tier: varchar("tier").notNull().default("free"),
  grantedBy: varchar("granted_by").notNull().default("default"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserTier = typeof userTiersTable.$inferSelect;
