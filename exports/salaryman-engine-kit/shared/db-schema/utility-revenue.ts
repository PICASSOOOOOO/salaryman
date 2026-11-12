import { pgTable, serial, varchar, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Company-revenue ledger for the PABLO POWER & GAS utility monopoly.
 *
 * Every FIAT utility purchase a player makes (batteries, gas, electricity) is
 * recorded here as one revenue row attributed to the owning company (PICASSO).
 * This is the authoritative "owner / Picasso ledger" for the utility business —
 * the consumer side debits the player's bank account as usual, and this row is
 * the credit side: what the monopoly earned. Downstream reporting can sum
 * `amount_fiat` by `kind` or over a window to show utility income.
 */
export const utilityRevenueTable = pgTable(
  "utility_revenue",
  {
    id: serial("id").primaryKey(),
    // The paying player.
    userId: varchar("user_id", { length: 64 }).notNull(),
    // Owning company / org the revenue routes to (e.g. "PICASSO").
    company: varchar("company", { length: 64 }).notNull(),
    // battery | gas | electricity.
    kind: varchar("kind", { length: 16 }).notNull(),
    // The inventory item id sold, when applicable (e.g. batt_cell, fuel_gas_can).
    itemId: varchar("item_id", { length: 64 }),
    // Quantity of units/items moved (battery count, gas units, charge units).
    units: integer("units").notNull().default(1),
    // Revenue booked in FIAT (ƒ). Always >= 0.
    amountFiat: integer("amount_fiat").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index("utility_revenue_company_idx").on(t.company),
    userIdx: index("utility_revenue_user_idx").on(t.userId),
    createdIdx: index("utility_revenue_created_idx").on(t.createdAt),
  }),
);

export const insertUtilityRevenueSchema = createInsertSchema(utilityRevenueTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUtilityRevenue = z.infer<typeof insertUtilityRevenueSchema>;
export type UtilityRevenue = typeof utilityRevenueTable.$inferSelect;
