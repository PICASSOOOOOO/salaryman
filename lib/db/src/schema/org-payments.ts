import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

/**
 * Provider-neutral organization payment records. Provider identifiers and
 * minor-unit amounts remain external to the in-game FIAT treasury.
 */
export const orgPaymentConnectionsTable = pgTable(
  "org_payment_connections",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 200 }).notNull(),
    accountStatus: varchar("account_status", { length: 32 }).notNull().default("onboarding"),
    chargesEnabled: boolean("charges_enabled").notNull().default(false),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    connectedByUserId: varchar("connected_by_user_id").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("org_payment_connections_org_provider_unique_idx").on(table.orgId, table.provider),
    uniqueIndex("org_payment_connections_provider_account_unique_idx").on(
      table.provider,
      table.providerAccountId,
    ),
    index("org_payment_connections_org_idx").on(table.orgId),
  ],
);

export const orgPaymentsTable = pgTable(
  "org_payments",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 200 }).notNull(),
    providerCheckoutId: varchar("provider_checkout_id", { length: 200 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 200 }),
    requestKey: varchar("request_key", { length: 80 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    refundedMinor: bigint("refunded_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    description: varchar("description", { length: 200 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdByUserId: varchar("created_by_user_id").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("org_payments_org_provider_request_key_unique_idx").on(
      table.orgId,
      table.provider,
      table.requestKey,
    ),
    uniqueIndex("org_payments_provider_checkout_unique_idx").on(
      table.provider,
      table.providerCheckoutId,
    ),
    uniqueIndex("org_payments_provider_payment_unique_idx").on(
      table.provider,
      table.providerPaymentId,
    ),
    index("org_payments_org_created_idx").on(table.orgId, table.createdAt),
    index("org_payments_org_status_idx").on(table.orgId, table.status),
  ],
);

export const orgPaymentWebhookEventsTable = pgTable(
  "org_payment_webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 200 }).notNull(),
    providerEventType: varchar("provider_event_type", { length: 120 }).notNull(),
    paymentId: integer("payment_id").references(() => orgPaymentsTable.id, {
      onDelete: "cascade",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("org_payment_webhook_provider_event_unique_idx").on(
      table.provider,
      table.providerEventId,
    ),
    index("org_payment_webhook_payment_idx").on(table.paymentId),
  ],
);

export type OrgPaymentConnection = typeof orgPaymentConnectionsTable.$inferSelect;
export type OrgPayment = typeof orgPaymentsTable.$inferSelect;
export type OrgPaymentWebhookEvent = typeof orgPaymentWebhookEventsTable.$inferSelect;
