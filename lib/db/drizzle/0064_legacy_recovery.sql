CREATE TABLE IF NOT EXISTS "legacy_recovery_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" varchar(96) NOT NULL,
  "email_key" varchar(320) NOT NULL,
  "source_user_id" varchar(256) NOT NULL,
  "source_economic_id" varchar(64),
  "fiat_balance" integer DEFAULT 0 NOT NULL,
  "gold" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pledges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "restored_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_recovery_batch_email_uq"
  ON "legacy_recovery_snapshots" ("batch_id", "email_key");
CREATE INDEX IF NOT EXISTS "legacy_recovery_email_idx"
  ON "legacy_recovery_snapshots" ("email_key");
CREATE INDEX IF NOT EXISTS "legacy_recovery_unrestored_idx"
  ON "legacy_recovery_snapshots" ("email_key", "restored_at");

CREATE TABLE IF NOT EXISTS "legacy_recovery_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_key" varchar(256) NOT NULL,
  "email_key" varchar(320) NOT NULL,
  "source_user_id" varchar(256) NOT NULL,
  "source_economic_id" varchar(64),
  "kind" varchar(32) NOT NULL,
  "item_id" varchar(96),
  "slot_index" integer,
  "quantity" integer DEFAULT 1 NOT NULL,
  "amount_fiat" integer DEFAULT 0 NOT NULL,
  "payload" jsonb,
  "restored_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "legacy_recovery_event_key_uq"
  ON "legacy_recovery_events" ("event_key");
CREATE INDEX IF NOT EXISTS "legacy_recovery_events_email_idx"
  ON "legacy_recovery_events" ("email_key", "restored_at");