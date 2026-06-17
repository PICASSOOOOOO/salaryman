import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

// Real-money FIAT top-ups: a player pays USD via Stripe and the confirmed
// payment credits their in-game server bank ƒ at 1000ƒ = $1. One row per Stripe
// checkout session; stripeSessionId is unique so the webhook can fulfil exactly
// once (pending → completed) and survive duplicate webhook deliveries.
export const fiatTopupsTable = pgTable("fiat_topups", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  stripeSessionId: varchar("stripe_session_id", { length: 256 }).notNull().unique(),
  packId: varchar("pack_id", { length: 64 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  fiatAmount: integer("fiat_amount").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("fiat_topups_user_id_idx").on(t.userId),
  index("fiat_topups_stripe_session_idx").on(t.stripeSessionId),
]);

export type FiatTopup = typeof fiatTopupsTable.$inferSelect;
