import {
  pgTable,
  serial,
  varchar,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// A real link between a SALARYMAN user and a live social platform account.
// `credentials` holds provider-specific secrets (app passwords, webhook URLs,
// OAuth access/refresh tokens) as JSON. `status` is the lifecycle of the link.
// One row per (userId, provider): connecting again upserts.
export const socialConnectionsTable = pgTable(
  "social_connections",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    orgId: varchar("org_id", { length: 64 }),
    provider: varchar("provider", { length: 32 }).notNull(),
    // connected | needs_setup | error | revoked
    status: varchar("status", { length: 32 }).notNull().default("needs_setup"),
    accountHandle: varchar("account_handle", { length: 256 }),
    accountName: varchar("account_name", { length: 256 }),
    credentials: jsonb("credentials").$type<Record<string, string>>().default({}),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    lastError: varchar("last_error", { length: 512 }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("social_connections_user_provider_idx").on(table.userId, table.provider),
    index("social_connections_user_idx").on(table.userId),
    index("social_connections_provider_idx").on(table.provider),
  ]
);
