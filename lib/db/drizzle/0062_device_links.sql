CREATE TABLE IF NOT EXISTS "device_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "desktop_device_id" varchar(128) NOT NULL,
  "desktop_name" varchar(80) NOT NULL,
  "mobile_device_id" varchar(128),
  "mobile_name" varchar(80),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "pairing_code_hash" varchar(128),
  "pairing_code_expires_at" timestamp with time zone,
  "desktop_approved_at" timestamp with time zone,
  "mobile_approved_at" timestamp with time zone,
  "linked_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_desktop_seen_at" timestamp with time zone,
  "last_mobile_seen_at" timestamp with time zone,
  "scopes" jsonb DEFAULT '["salaryman_app"]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "device_links_user_idx" ON "device_links" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "device_links_user_desktop_idx" ON "device_links" ("user_id", "desktop_device_id");

CREATE TABLE IF NOT EXISTS "device_link_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "actor" varchar(20) NOT NULL,
  "event_type" varchar(40) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "device_link_events_link_idx" ON "device_link_events" ("link_id", "created_at");
CREATE INDEX IF NOT EXISTS "device_link_events_user_idx" ON "device_link_events" ("user_id", "created_at");