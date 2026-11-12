CREATE TABLE "organization_connector_apps" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_user_id" varchar(255) NOT NULL,
  "client_id" varchar(64) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "requested_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_connector_apps_client_id_uidx"
  ON "organization_connector_apps" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "organization_connector_apps_owner_idx"
  ON "organization_connector_apps" USING btree ("owner_user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "organization_connector_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "app_id" integer NOT NULL REFERENCES "organization_connector_apps"("id") ON DELETE RESTRICT,
  "granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(24) DEFAULT 'connected' NOT NULL,
  "token_hash" varchar(64),
  "token_prefix" varchar(24),
  "connected_by_user_id" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_activity_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_connector_connections_org_app_uidx"
  ON "organization_connector_connections" USING btree ("org_id", "app_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_connector_connections_token_hash_uidx"
  ON "organization_connector_connections" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "organization_connector_connections_org_status_idx"
  ON "organization_connector_connections" USING btree ("org_id", "status");
--> statement-breakpoint
CREATE TABLE "organization_connector_activity" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "connection_id" integer NOT NULL REFERENCES "organization_connector_connections"("id") ON DELETE CASCADE,
  "app_id" integer NOT NULL REFERENCES "organization_connector_apps"("id") ON DELETE CASCADE,
  "actor_user_id" varchar(255),
  "event_type" varchar(40) NOT NULL,
  "resource_type" varchar(40),
  "summary" varchar(240) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "organization_connector_activity_org_created_idx"
  ON "organization_connector_activity" USING btree ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX "organization_connector_activity_connection_created_idx"
  ON "organization_connector_activity" USING btree ("connection_id", "created_at");
