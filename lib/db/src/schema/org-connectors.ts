import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const ORG_CONNECTOR_SCOPES = [
  "crm:read",
  "crm:write",
  "calls:read",
  "calls:write",
  "documents:read",
  "documents:write",
] as const;

export type OrgConnectorScope = (typeof ORG_CONNECTOR_SCOPES)[number];

export const orgConnectorAppsTable = pgTable("organization_connector_apps", {
  id: serial("id").primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 255 }).notNull(),
  clientId: varchar("client_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  requestedScopes: jsonb("requested_scopes").$type<OrgConnectorScope[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("organization_connector_apps_client_id_uidx").on(t.clientId),
  index("organization_connector_apps_owner_idx").on(t.ownerUserId, t.createdAt),
]);

export const orgConnectorConnectionsTable = pgTable("organization_connector_connections", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  appId: integer("app_id").notNull().references(() => orgConnectorAppsTable.id, { onDelete: "restrict" }),
  grantedScopes: jsonb("granted_scopes").$type<OrgConnectorScope[]>().notNull().default([]),
  status: varchar("status", { length: 24 }).notNull().default("connected"),
  tokenHash: varchar("token_hash", { length: 64 }),
  tokenPrefix: varchar("token_prefix", { length: 24 }),
  connectedByUserId: varchar("connected_by_user_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("organization_connector_connections_org_app_uidx").on(t.orgId, t.appId),
  uniqueIndex("organization_connector_connections_token_hash_uidx").on(t.tokenHash),
  index("organization_connector_connections_org_status_idx").on(t.orgId, t.status),
]);

export const orgConnectorActivityTable = pgTable("organization_connector_activity", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  connectionId: integer("connection_id").notNull().references(() => orgConnectorConnectionsTable.id, { onDelete: "cascade" }),
  appId: integer("app_id").notNull().references(() => orgConnectorAppsTable.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id", { length: 255 }),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  resourceType: varchar("resource_type", { length: 40 }),
  summary: varchar("summary", { length: 240 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("organization_connector_activity_org_created_idx").on(t.orgId, t.createdAt),
  index("organization_connector_activity_connection_created_idx").on(t.connectionId, t.createdAt),
]);

export type OrgConnectorApp = typeof orgConnectorAppsTable.$inferSelect;
export type OrgConnectorConnection = typeof orgConnectorConnectionsTable.$inferSelect;
export type OrgConnectorActivity = typeof orgConnectorActivityTable.$inferSelect;
