ALTER TABLE "device_links"
  ADD COLUMN IF NOT EXISTS "desktop_access_token_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "desktop_access_token_issued_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "desktop_work_leases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "desktop_device_id" varchar(128) NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "max_minutes" integer DEFAULT 480 NOT NULL,
  "consumed_minutes" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "desktop_work_leases_user_idx" ON "desktop_work_leases" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "desktop_work_leases_link_idx" ON "desktop_work_leases" ("link_id", "status");

CREATE TABLE IF NOT EXISTS "desktop_work_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" varchar(128) NOT NULL,
  "lease_id" uuid NOT NULL,
  "link_id" uuid NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "desktop_device_id" varchar(128) NOT NULL,
  "work_type" varchar(40) NOT NULL,
  "work_minutes" integer NOT NULL,
  "amount_fiat" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) NOT NULL,
  "rejection_reason" varchar(120),
  "reported_at" timestamp with time zone NOT NULL,
  "settled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "desktop_work_claims_event_idx" ON "desktop_work_claims" ("event_id");
CREATE INDEX IF NOT EXISTS "desktop_work_claims_user_idx" ON "desktop_work_claims" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "desktop_work_claims_lease_idx" ON "desktop_work_claims" ("lease_id", "created_at");