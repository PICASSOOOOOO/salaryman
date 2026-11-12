CREATE TABLE IF NOT EXISTS "tower_alarm_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "building_key" varchar(64) DEFAULT 'shadow_tower' NOT NULL,
  "event_key" varchar(160) NOT NULL,
  "alarm_type" varchar(24) NOT NULL,
  "floor_key" varchar(12) NOT NULL,
  "zone_key" varchar(64) NOT NULL,
  "organization_key" varchar(120),
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "radius" integer DEFAULT 1500 NOT NULL,
  "mode" varchar(16) NOT NULL,
  "summary" varchar(220) NOT NULL,
  "requires_manual_shutdown" boolean DEFAULT true NOT NULL,
  "sound_until_at" timestamp with time zone,
  "status" varchar(12) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "silenced_at" timestamp with time zone,
  "silenced_by_user_id" varchar(256) REFERENCES "users"("id") ON DELETE SET NULL,
  "silenced_by_npc" boolean DEFAULT false NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "tower_alarm_events_id_pk" PRIMARY KEY ("id"),
  CONSTRAINT "tower_alarm_events_type_check" CHECK ("alarm_type" in ('power_failure', 'water_failure', 'fire', 'smoke', 'flood', 'poison', 'crime_scene', 'sprinkler_failure')),
  CONSTRAINT "tower_alarm_events_floor_check" CHECK ("floor_key" ~ '^(B[1-6]|F(0[1-9]|[1-5][0-9]|6[0-7]))$'),
  CONSTRAINT "tower_alarm_events_position_check" CHECK ("x" between 0 and 100000000 and "y" between 0 and 100000000 and "radius" between 100 and 10000),
  CONSTRAINT "tower_alarm_events_mode_check" CHECK ("mode" in ('silent', 'lights_only', 'quiet', 'medium', 'loud')),
  CONSTRAINT "tower_alarm_events_status_check" CHECK ("status" in ('active', 'silenced', 'resolved'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_alarm_events_event_key_unique"
  ON "tower_alarm_events" ("event_key");
CREATE UNIQUE INDEX IF NOT EXISTS "tower_alarm_events_one_active_type_idx"
  ON "tower_alarm_events" (
    "building_key",
    "alarm_type",
    "floor_key",
    "zone_key",
    (coalesce("organization_key", ''))
  )
  WHERE "status" in ('active', 'silenced');
CREATE INDEX IF NOT EXISTS "tower_alarm_events_status_created_idx"
  ON "tower_alarm_events" ("building_key", "status", "created_at");
