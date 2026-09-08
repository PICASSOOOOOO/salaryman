import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { leadRecordsTable } from "./leads";

export const CRM_ROUTE_CHANNELS = ["sms", "call", "comms"] as const;
export type CrmRouteChannel = (typeof CRM_ROUTE_CHANNELS)[number];

export const CRM_ROUTE_FALLBACKS = ["none", ...CRM_ROUTE_CHANNELS] as const;
export type CrmRouteFallback = (typeof CRM_ROUTE_FALLBACKS)[number];

export const CRM_COMMS_TARGETS = ["company", "assigned"] as const;
export type CrmCommsTarget = (typeof CRM_COMMS_TARGETS)[number];

/**
 * An org-owned outreach policy. Profiles let a sales team standardize routing
 * without preventing a salesperson from overriding the route for one lead.
 *
 * phoneNumberId intentionally stays a plain integer: phone_numbers supports
 * both personal numbers and org pool numbers and has no FK to organizations.
 */
export const crmRoutingProfilesTable = pgTable(
  "crm_routing_profiles",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    primaryChannel: varchar("primary_channel", { length: 16 }).notNull().default("sms"),
    fallbackChannel: varchar("fallback_channel", { length: 16 }).notNull().default("comms"),
    phoneNumberId: integer("phone_number_id"),
    commsTarget: varchar("comms_target", { length: 16 }).notNull().default("company"),
    commsUserId: varchar("comms_user_id", { length: 256 }),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("crm_routing_profiles_org_idx").on(table.orgId),
    uniqueIndex("crm_routing_profiles_org_name_uq").on(table.orgId, table.name),
  ],
);

export type CrmRoutingProfile = typeof crmRoutingProfilesTable.$inferSelect;
export type InsertCrmRoutingProfile = typeof crmRoutingProfilesTable.$inferInsert;

/**
 * Optional per-lead override. A missing row means the org default profile
 * applies; this keeps existing leads compatible and makes reset-to-default
 * an ordinary delete.
 */
export const crmLeadRoutingTable = pgTable(
  "crm_lead_routing",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull(),
    leadId: integer("lead_id").notNull().references(() => leadRecordsTable.id, { onDelete: "cascade" }),
    profileId: integer("profile_id").references(() => crmRoutingProfilesTable.id, { onDelete: "set null" }),
    primaryChannel: varchar("primary_channel", { length: 16 }),
    fallbackChannel: varchar("fallback_channel", { length: 16 }),
    phoneNumberId: integer("phone_number_id"),
    commsTarget: varchar("comms_target", { length: 16 }),
    commsUserId: varchar("comms_user_id", { length: 256 }),
    updatedByUserId: varchar("updated_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_lead_routing_lead_uq").on(table.leadId),
    index("crm_lead_routing_org_idx").on(table.orgId),
  ],
);

export type CrmLeadRouting = typeof crmLeadRoutingTable.$inferSelect;
export type InsertCrmLeadRouting = typeof crmLeadRoutingTable.$inferInsert;