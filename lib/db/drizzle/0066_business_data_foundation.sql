CREATE TABLE IF NOT EXISTS "business_entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "entity_type" varchar(24) NOT NULL,
  "display_name" varchar(300) NOT NULL,
  "legal_name" varchar(300),
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "owner_user_id" varchar(256),
  "external_key" varchar(256),
  "search_text" text DEFAULT '' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "business_entities_org_type_updated_idx" ON "business_entities" ("org_id", "entity_type", "updated_at");
CREATE INDEX IF NOT EXISTS "business_entities_org_owner_idx" ON "business_entities" ("org_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "business_entities_org_status_idx" ON "business_entities" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "business_entities_external_key_idx" ON "business_entities" ("org_id", "external_key");

CREATE TABLE IF NOT EXISTS "business_contact_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "entity_id" uuid NOT NULL REFERENCES "business_entities"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "value" varchar(1000) NOT NULL,
  "normalized_value" varchar(1000) NOT NULL,
  "label" varchar(80),
  "is_primary" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "business_contact_points_entity_idx" ON "business_contact_points" ("entity_id", "kind");
CREATE INDEX IF NOT EXISTS "business_contact_points_org_lookup_idx" ON "business_contact_points" ("org_id", "kind", "normalized_value");
CREATE UNIQUE INDEX IF NOT EXISTS "business_contact_points_entity_value_idx" ON "business_contact_points" ("entity_id", "kind", "normalized_value");

CREATE TABLE IF NOT EXISTS "business_entity_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "from_entity_id" uuid NOT NULL REFERENCES "business_entities"("id") ON DELETE CASCADE,
  "to_entity_id" uuid NOT NULL REFERENCES "business_entities"("id") ON DELETE CASCADE,
  "relation_type" varchar(60) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_entity_relations_unique_idx" ON "business_entity_relations" ("from_entity_id", "to_entity_id", "relation_type");
CREATE INDEX IF NOT EXISTS "business_entity_relations_org_type_idx" ON "business_entity_relations" ("org_id", "relation_type");
CREATE INDEX IF NOT EXISTS "business_entity_relations_to_idx" ON "business_entity_relations" ("to_entity_id", "relation_type");

CREATE TABLE IF NOT EXISTS "business_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "uploaded_by_user_id" varchar(256) NOT NULL,
  "object_path" varchar(1000) NOT NULL,
  "name" varchar(500) NOT NULL,
  "kind" varchar(24) NOT NULL,
  "mime_type" varchar(200) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "checksum_sha256" varchar(64),
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_files_object_path_idx" ON "business_files" ("object_path");
CREATE INDEX IF NOT EXISTS "business_files_org_created_idx" ON "business_files" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "business_files_org_kind_status_idx" ON "business_files" ("org_id", "kind", "status");

CREATE TABLE IF NOT EXISTS "business_file_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "file_id" uuid NOT NULL REFERENCES "business_files"("id") ON DELETE CASCADE,
  "entity_id" uuid NOT NULL REFERENCES "business_entities"("id") ON DELETE CASCADE,
  "label" varchar(80),
  "created_by_user_id" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_file_links_unique_idx" ON "business_file_links" ("file_id", "entity_id");
CREATE INDEX IF NOT EXISTS "business_file_links_entity_idx" ON "business_file_links" ("entity_id", "created_at");
CREATE INDEX IF NOT EXISTS "business_file_links_org_idx" ON "business_file_links" ("org_id", "created_at");

CREATE TABLE IF NOT EXISTS "business_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "file_id" uuid NOT NULL REFERENCES "business_files"("id") ON DELETE CASCADE,
  "document_type" varchar(60) DEFAULT 'general' NOT NULL,
  "processing_status" varchar(24) DEFAULT 'queued' NOT NULL,
  "extracted_text" text,
  "structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_documents_file_idx" ON "business_documents" ("file_id");
CREATE INDEX IF NOT EXISTS "business_documents_org_status_idx" ON "business_documents" ("org_id", "processing_status", "updated_at");

CREATE TABLE IF NOT EXISTS "business_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "entity_id" uuid,
  "actor_user_id" varchar(256),
  "activity_type" varchar(60) NOT NULL,
  "idempotency_key" varchar(160),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_activities_org_idempotency_idx" ON "business_activities" ("org_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "business_activities_entity_time_idx" ON "business_activities" ("entity_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "business_activities_org_time_idx" ON "business_activities" ("org_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "business_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" integer NOT NULL,
  "actor_user_id" varchar(256),
  "action" varchar(80) NOT NULL,
  "entity_type" varchar(40),
  "entity_id" uuid,
  "before_data" jsonb,
  "after_data" jsonb,
  "request_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "business_audit_events_org_time_idx" ON "business_audit_events" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "business_audit_events_entity_idx" ON "business_audit_events" ("entity_id", "created_at");