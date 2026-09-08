import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  stripeSessionId: varchar("stripe_session_id", { length: 256 }).notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  tier: varchar("tier", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("donations_user_id_idx").on(t.userId),
  index("donations_stripe_session_idx").on(t.stripeSessionId),
]);

export type Donation = typeof donationsTable.$inferSelect;
