import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";

export const crmSourceConnectionsTable = pgTable("crm_source_connections", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  direction: varchar("direction", { length: 20 }).notNull().default("pull"),
  configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
  encryptedAuth: text("encrypted_auth"),
  oauthStateHash: varchar("oauth_state_hash", { length: 128 }),
  oauthStateExpiresAt: timestamp("oauth_state_expires_at", { withTimezone: true }),
  enabled: varchar("enabled", { length: 10 }).notNull().default("true"),
  createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_source_connections_org_idx").on(t.orgId)]);

export const crmSyncRunsTable = pgTable("crm_sync_runs", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  connectionId: integer("connection_id").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("running"),
  direction: varchar("direction", { length: 20 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  summaryJson: jsonb("summary_json").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("crm_sync_runs_org_idx").on(t.orgId)]);

export const crmSyncChangesTable = pgTable("crm_sync_changes", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  runId: integer("run_id").notNull(),
  connectionId: integer("connection_id").notNull(),
  leadId: integer("lead_id"),
  externalKey: varchar("external_key", { length: 256 }),
  changedFieldsJson: jsonb("changed_fields_json").$type<Record<string, unknown>>().notNull().default({}),
  sourceSnapshotJson: jsonb("source_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  crmSnapshotJson: jsonb("crm_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  isSnapshot: boolean("is_snapshot").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("crm_sync_changes_org_idx").on(t.orgId),
  index("crm_sync_changes_snapshot_idx").on(t.connectionId, t.externalKey, t.isSnapshot, t.id),
]);

export const crmSyncConflictsTable = pgTable("crm_sync_conflicts", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  connectionId: integer("connection_id").notNull(),
  runId: integer("run_id").notNull(),
  changeId: integer("change_id").notNull(),
  leadId: integer("lead_id"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  sourceSnapshotJson: jsonb("source_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  crmSnapshotJson: jsonb("crm_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
  resolution: varchar("resolution", { length: 20 }),
  resolvedByUserId: varchar("resolved_by_user_id", { length: 256 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_sync_conflicts_org_idx").on(t.orgId)]);