import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

// Categories of real-money "pledges" sold in the Pledge Store. Each pledge
// grants an in-game advantage (property, agents, gear, decor, terminals,
// etc). The catalog itself lives in code (routes/pledge.ts PLEDGE_CATALOG);
// this table is the entitlement ledger — the single source of truth for what
// a user actually owns, so game systems can read entitlements as they get
// wired up.
export const PLEDGE_CATEGORIES = [
  "property",
  "bots",
  "weapons",
  "gear",
  "furniture",
  "technology",
  "office_supplies",
  "decor",
  "skins",
  "terminals",
  "bundles",
  "membership",
] as const;

export type PledgeCategory = (typeof PLEDGE_CATEGORIES)[number];

export const pledgePurchasesTable = pgTable(
  "pledge_purchases",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    itemId: varchar("item_id", { length: 96 }).notNull(),
    category: varchar("category", { length: 48 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    stripeSessionId: varchar("stripe_session_id", { length: 256 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    grantedBy: varchar("granted_by", { length: 64 }).notNull().default("stripe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pledge_purchases_user_id_idx").on(t.userId),
    index("pledge_purchases_stripe_session_idx").on(t.stripeSessionId),
  ],
);

export type PledgePurchase = typeof pledgePurchasesTable.$inferSelect;

// Limited / scarce pledge drops. One row per limited item id. `total` is the
// fixed quantity that will ever exist; `sold` is the atomically-incremented
// reserved/sold count. remaining = total - sold; an item sells out permanently
// when sold reaches total. Reservations are taken at checkout creation
// (atomic conditional UPDATE) and released if the Stripe session expires or the
// payment fails, so concurrent purchases can never oversell.
export const pledgeStockTable = pgTable(
  "pledge_stock",
  {
    itemId: varchar("item_id", { length: 96 }).primaryKey(),
    total: integer("total").notNull().default(0),
    sold: integer("sold").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type PledgeStock = typeof pledgeStockTable.$inferSelect;
