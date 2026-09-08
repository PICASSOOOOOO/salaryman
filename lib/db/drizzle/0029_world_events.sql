CREATE TABLE IF NOT EXISTS "world_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "city_id" varchar(64) NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "location_x" integer NOT NULL,
  "location_y" integer NOT NULL,
  "building_id" varchar(64),
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "spawned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolver_user_ids" jsonb DEFAULT '[]'::jsonb,
  "reward_fiat" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_responses" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" integer NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "responded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reward_paid" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "world_events_city_status_idx" ON "world_events" ("city_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_responses_event_idx" ON "event_responses" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_responses_user_idx" ON "event_responses" ("user_id");
