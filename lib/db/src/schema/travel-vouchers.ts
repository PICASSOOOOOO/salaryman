import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";

// Free intercity-travel vouchers. Granted when a LEGITIMATE business owner is
// held in a city's waiting lobby because their proper server is full — they
// shouldn't have to pay the cross-city toll just to stay productive while they
// wait for a floor to free. One voucher waives one intercity fare. Balance is
// capped (see grantTravelVoucher) so a full server can't be farmed for free
// travel. Keyed by userId only, so it's redeemable from any city.
export const travelVouchersTable = pgTable("travel_vouchers", {
  userId: varchar("user_id", { length: 256 }).primaryKey(),
  balance: integer("balance").notNull().default(0),
  reason: varchar("reason", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TravelVoucher = typeof travelVouchersTable.$inferSelect;
