import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export type OrgCustomAppFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

export interface OrgCustomAppField {
  key: string;
  label: string;
  type: OrgCustomAppFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export type OrgCustomAppStatus = "draft" | "published";

export const orgCustomAppsTable = pgTable(
  "org_custom_apps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 240 }).notNull().default(""),
    fields: jsonb("fields").$type<OrgCustomAppField[]>().notNull(),
    status: varchar("status", { length: 16 }).$type<OrgCustomAppStatus>().notNull().default("draft"),
    createdByUserId: varchar("created_by_user_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("org_custom_apps_org_slug_unique_idx").on(table.orgId, table.slug),
    index("org_custom_apps_org_status_idx").on(table.orgId, table.status),
  ],
);

export const orgCustomAppRecordsTable = pgTable(
  "org_custom_app_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => orgCustomAppsTable.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdByUserId: varchar("created_by_user_id").notNull(),
    updatedByUserId: varchar("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("org_custom_app_records_org_app_created_idx").on(
      table.orgId,
      table.appId,
      table.createdAt,
    ),
  ],
);

export type OrgCustomApp = typeof orgCustomAppsTable.$inferSelect;
export type OrgCustomAppRecord = typeof orgCustomAppRecordsTable.$inferSelect;
