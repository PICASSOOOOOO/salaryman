import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BUSINESS_ENTITY_TYPES = ["person", "company", "lead", "contact", "employee", "vendor", "customer"] as const;
export type BusinessEntityType = (typeof BUSINESS_ENTITY_TYPES)[number];

export const BUSINESS_CONTACT_POINT_TYPES = ["email", "phone", "address", "website", "social"] as const;
export type BusinessContactPointType = (typeof BUSINESS_CONTACT_POINT_TYPES)[number];

export const BUSINESS_FILE_KINDS = ["document", "image", "video", "audio", "spreadsheet", "other"] as const;
export type BusinessFileKind = (typeof BUSINESS_FILE_KINDS)[number];

/**
 * Canonical org-owned records. Feature-specific tables can migrate into this
 * contract incrementally without putting large files or unbounded custom
 * columns in the relational core.
 */
export const businessEntitiesTable = pgTable(
  "business_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    legalName: varchar("legal_name", { length: 300 }),
    status: varchar("status", { length: 40 }).notNull().default("active"),
    ownerUserId: varchar("owner_user_id", { length: 256 }),
    externalKey: varchar("external_key", { length: 256 }),
    searchText: text("search_text").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("business_entities_org_type_updated_idx").on(table.orgId, table.entityType, table.updatedAt),
    index("business_entities_org_owner_idx").on(table.orgId, table.ownerUserId),
    index("business_entities_org_status_idx").on(table.orgId, table.status),
    index("business_entities_external_key_idx").on(table.orgId, table.externalKey),
  ],
);

export const businessContactPointsTable = pgTable(
  "business_contact_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    entityId: uuid("entity_id").notNull().references(() => businessEntitiesTable.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    value: varchar("value", { length: 1000 }).notNull(),
    normalizedValue: varchar("normalized_value", { length: 1000 }).notNull(),
    label: varchar("label", { length: 80 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("business_contact_points_entity_idx").on(table.entityId, table.kind),
    index("business_contact_points_org_lookup_idx").on(table.orgId, table.kind, table.normalizedValue),
    uniqueIndex("business_contact_points_entity_value_idx").on(table.entityId, table.kind, table.normalizedValue),
  ],
);

export const businessEntityRelationsTable = pgTable(
  "business_entity_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    fromEntityId: uuid("from_entity_id").notNull().references(() => businessEntitiesTable.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id").notNull().references(() => businessEntitiesTable.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 60 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_entity_relations_unique_idx").on(table.fromEntityId, table.toEntityId, table.relationType),
    index("business_entity_relations_org_type_idx").on(table.orgId, table.relationType),
    index("business_entity_relations_to_idx").on(table.toEntityId, table.relationType),
  ],
);

/**
 * Metadata/index for App Storage objects. Object bytes never belong in
 * PostgreSQL; objectPath is the stable storage pointer used by the API.
 */
export const businessFilesTable = pgTable(
  "business_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    uploadedByUserId: varchar("uploaded_by_user_id", { length: 256 }).notNull(),
    objectPath: varchar("object_path", { length: 1000 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    kind: varchar("kind", { length: 24 }).notNull(),
    mimeType: varchar("mime_type", { length: 200 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("business_files_object_path_idx").on(table.objectPath),
    index("business_files_org_created_idx").on(table.orgId, table.createdAt),
    index("business_files_org_kind_status_idx").on(table.orgId, table.kind, table.status),
  ],
);

export const businessFileLinksTable = pgTable(
  "business_file_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    fileId: uuid("file_id").notNull().references(() => businessFilesTable.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull().references(() => businessEntitiesTable.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }),
    createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_file_links_unique_idx").on(table.fileId, table.entityId),
    index("business_file_links_entity_idx").on(table.entityId, table.createdAt),
    index("business_file_links_org_idx").on(table.orgId, table.createdAt),
  ],
);

export const businessDocumentsTable = pgTable(
  "business_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    fileId: uuid("file_id").notNull().references(() => businessFilesTable.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 60 }).notNull().default("general"),
    processingStatus: varchar("processing_status", { length: 24 }).notNull().default("queued"),
    extractedText: text("extracted_text"),
    structuredData: jsonb("structured_data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_documents_file_idx").on(table.fileId),
    index("business_documents_org_status_idx").on(table.orgId, table.processingStatus, table.updatedAt),
  ],
);

export const businessActivitiesTable = pgTable(
  "business_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    entityId: uuid("entity_id"),
    actorUserId: varchar("actor_user_id", { length: 256 }),
    activityType: varchar("activity_type", { length: 60 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_activities_org_idempotency_idx").on(table.orgId, table.idempotencyKey),
    index("business_activities_entity_time_idx").on(table.entityId, table.occurredAt),
    index("business_activities_org_time_idx").on(table.orgId, table.occurredAt),
  ],
);

export const businessAuditEventsTable = pgTable(
  "business_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: integer("org_id").notNull(),
    actorUserId: varchar("actor_user_id", { length: 256 }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: uuid("entity_id"),
    beforeData: jsonb("before_data").$type<Record<string, unknown> | null>(),
    afterData: jsonb("after_data").$type<Record<string, unknown> | null>(),
    requestId: varchar("request_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("business_audit_events_org_time_idx").on(table.orgId, table.createdAt),
    index("business_audit_events_entity_idx").on(table.entityId, table.createdAt),
  ],
);

export const insertBusinessEntitySchema = createInsertSchema(businessEntitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type BusinessEntity = typeof businessEntitiesTable.$inferSelect;
export type InsertBusinessEntity = z.infer<typeof insertBusinessEntitySchema>;
export type BusinessFile = typeof businessFilesTable.$inferSelect;
export type BusinessActivity = typeof businessActivitiesTable.$inferSelect;