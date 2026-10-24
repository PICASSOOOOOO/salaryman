CREATE TABLE "org_document_upload_intents" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "connection_id" integer NOT NULL REFERENCES "organization_connector_connections"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(128) NOT NULL,
  "name" varchar(300) NOT NULL,
  "parent_id" integer,
  "mime_type" varchar(200) NOT NULL,
  "expected_file_size" integer NOT NULL,
  "object_path" varchar(1000) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "document_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_document_upload_connection_idempotency_uidx"
  ON "org_document_upload_intents" USING btree ("connection_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "org_document_upload_expiry_idx"
  ON "org_document_upload_intents" USING btree ("expires_at");
