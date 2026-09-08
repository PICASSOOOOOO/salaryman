import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

// Bounded comp grants for the "tester" bypass. Picasso staff (developer org
// members) are NOT tracked here — they're permanently free as part of the
// company. This table only caps the open public-tester pool.
//
// One row per user. Insertion is the atomic "claim" of a slot; we cap the
// pool by checking COUNT(*) < TESTER_COMP_LIMIT inside a transaction or via
// a CTE-guarded insert. The PK on userId makes re-grants idempotent.
export const testerCompGrantsTable = pgTable("tester_comp_grants", {
  userId: varchar("user_id").primaryKey(),
  email: varchar("email", { length: 320 }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TesterCompGrant = typeof testerCompGrantsTable.$inferSelect;

// Hard cap on the number of free-tester slots. Tweak here, not in routes.
export const TESTER_COMP_LIMIT = 100;
