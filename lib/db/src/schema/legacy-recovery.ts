import { integer, jsonb, pgTable, serial, timestamp, unique, varchar, index } from "drizzle-orm/pg-core";

export type LegacyRecoveryInventory = Array<{
  slotIndex: number;
  itemId: string;
  quantity: number;
  acquiredVia: string;
}>;

export type LegacyRecoveryGold = Array<{
  slotIndex: number;
  balanceTenths: number;
}>;

export type LegacyRecoveryPledge = Array<{
  itemId: string;
  category: string;
  name: string;
  amountCents: number;
  stripeSessionId: string | null;
  grantedBy: string;
}>;

export type LegacyRecoveryProperty = Array<{
  slotIndex: number;
  propertyDeeds: unknown[];
}>;

/**
 * Reset-independent player snapshots. This table is intentionally not included
 * in any gameplay reset list. `emailKey` is the recovery lookup, while the
 * source identity fields prevent a second local account from claiming a
 * colliding email snapshot.
 */
export const legacyRecoverySnapshotsTable = pgTable(
  "legacy_recovery_snapshots",
  {
    id: serial("id").primaryKey(),
    batchId: varchar("batch_id", { length: 96 }).notNull(),
    emailKey: varchar("email_key", { length: 320 }).notNull(),
    sourceUserId: varchar("source_user_id", { length: 256 }).notNull(),
    sourceEconomicId: varchar("source_economic_id", { length: 64 }),
    fiatBalance: integer("fiat_balance").notNull().default(0),
    gold: jsonb("gold").notNull().$type<LegacyRecoveryGold>().default([]),
    inventory: jsonb("inventory").notNull().$type<LegacyRecoveryInventory>().default([]),
    pledges: jsonb("pledges").notNull().$type<LegacyRecoveryPledge>().default([]),
    properties: jsonb("properties").notNull().$type<LegacyRecoveryProperty>().default([]),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("legacy_recovery_batch_email_uq").on(t.batchId, t.emailKey),
    index("legacy_recovery_email_idx").on(t.emailKey),
    index("legacy_recovery_unrestored_idx").on(t.emailKey, t.restoredAt),
  ],
);

export type LegacyRecoverySnapshot = typeof legacyRecoverySnapshotsTable.$inferSelect;

export const legacyRecoveryEventsTable = pgTable(
  "legacy_recovery_events",
  {
    id: serial("id").primaryKey(),
    eventKey: varchar("event_key", { length: 256 }).notNull(),
    emailKey: varchar("email_key", { length: 320 }).notNull(),
    sourceUserId: varchar("source_user_id", { length: 256 }).notNull(),
    sourceEconomicId: varchar("source_economic_id", { length: 64 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    itemId: varchar("item_id", { length: 96 }),
    slotIndex: integer("slot_index"),
    quantity: integer("quantity").notNull().default(1),
    amountFiat: integer("amount_fiat").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("legacy_recovery_event_key_uq").on(t.eventKey),
    index("legacy_recovery_events_email_idx").on(t.emailKey, t.restoredAt),
  ],
);

export type LegacyRecoveryEvent = typeof legacyRecoveryEventsTable.$inferSelect;