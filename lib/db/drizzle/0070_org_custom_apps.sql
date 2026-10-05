CREATE TABLE IF NOT EXISTS "org_custom_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(80) NOT NULL,
  "description" varchar(240) NOT NULL DEFAULT '',
  "fields" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'draft',
  "created_by_user_id" varchar NOT NULL,
  "updated_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_custom_apps_org_slug_unique_idx"
  ON "org_custom_apps" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "org_custom_apps_org_status_idx"
  ON "org_custom_apps" ("org_id", "status");

CREATE TABLE IF NOT EXISTS "org_custom_app_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "app_id" uuid NOT NULL REFERENCES "org_custom_apps"("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL,
  "created_by_user_id" varchar NOT NULL,
  "updated_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "org_custom_app_records_org_app_created_idx"
  ON "org_custom_app_records" ("org_id", "app_id", "created_at");
