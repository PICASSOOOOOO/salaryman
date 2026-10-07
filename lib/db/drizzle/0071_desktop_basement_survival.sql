CREATE TABLE IF NOT EXISTS "desktop_basement_presence" (
  "user_id" varchar(256) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "device_links"("id") ON DELETE CASCADE,
  "level" integer NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "action" varchar(16) DEFAULT 'stand' NOT NULL,
  "uniform_worn" boolean DEFAULT false NOT NULL,
  "work_target" varchar(16),
  "work_session_id" uuid,
  "work_started_at" timestamp with time zone,
  "last_completed_work_session_id" uuid,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desktop_basement_presence_level_check" CHECK ("level" between 1 and 6),
  CONSTRAINT "desktop_basement_presence_x_check" CHECK ("x" between 0 and 10000),
  CONSTRAINT "desktop_basement_presence_y_check" CHECK ("y" between 0 and 10000),
  CONSTRAINT "desktop_basement_presence_action_check" CHECK ("action" in ('stand', 'walk', 'attack', 'maintenance')),
  CONSTRAINT "desktop_basement_presence_work_target_check" CHECK ("work_target" is null or "work_target" in ('power', 'plumbing', 'upkeep'))
);
CREATE INDEX IF NOT EXISTS "desktop_basement_presence_level_seen_idx"
  ON "desktop_basement_presence" ("level", "last_seen_at");

CREATE TABLE IF NOT EXISTS "tower_building_vitals" (
  "building_key" varchar(64) PRIMARY KEY NOT NULL DEFAULT 'shadow_tower',
  "power_condition" integer DEFAULT 100 NOT NULL,
  "plumbing_condition" integer DEFAULT 100 NOT NULL,
  "upkeep_condition" integer DEFAULT 100 NOT NULL,
  "last_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_user_id" varchar(256) REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_building_vitals_power_check" CHECK ("power_condition" between 0 and 100),
  CONSTRAINT "tower_building_vitals_plumbing_check" CHECK ("plumbing_condition" between 0 and 100),
  CONSTRAINT "tower_building_vitals_upkeep_check" CHECK ("upkeep_condition" between 0 and 100)
);

CREATE TABLE IF NOT EXISTS "desktop_basement_pests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "building_key" varchar(64) DEFAULT 'shadow_tower' NOT NULL,
  "level" integer NOT NULL,
  "spawn_number" integer NOT NULL,
  "kind" varchar(16) NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "health" integer NOT NULL,
  "max_health" integer NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "bounty_fiat" integer NOT NULL,
  "defeated_by_user_id" varchar(256) REFERENCES "users"("id") ON DELETE SET NULL,
  "defeated_at" timestamp with time zone,
  "last_npc_worked_at" timestamp with time zone,
  "claimed_by_user_id" varchar(256) REFERENCES "users"("id") ON DELETE SET NULL,
  "claimed_at" timestamp with time zone,
  "sold_by_user_id" varchar(256) REFERENCES "users"("id") ON DELETE SET NULL,
  "sold_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desktop_basement_pests_spawn_unique" UNIQUE ("building_key", "level", "spawn_number"),
  CONSTRAINT "desktop_basement_pests_level_check" CHECK ("level" between 1 and 6),
  CONSTRAINT "desktop_basement_pests_kind_check" CHECK ("kind" in ('rat', 'snake')),
  CONSTRAINT "desktop_basement_pests_status_check" CHECK ("status" in ('active', 'carcass', 'sold')),
  CONSTRAINT "desktop_basement_pests_position_check" CHECK ("x" between 0 and 10000 and "y" between 0 and 10000),
  CONSTRAINT "desktop_basement_pests_health_check" CHECK ("max_health" > 0 and "health" between 0 and "max_health"),
  CONSTRAINT "desktop_basement_pests_bounty_check" CHECK ("bounty_fiat" between 0 and 100000),
  CONSTRAINT "desktop_basement_pests_defeat_state_check" CHECK (("status" = 'active' and "health" > 0 and "defeated_at" is null) or ("status" in ('carcass', 'sold') and "health" = 0 and "defeated_at" is not null))
);
CREATE INDEX IF NOT EXISTS "desktop_basement_pests_level_status_idx"
  ON "desktop_basement_pests" ("building_key", "level", "status");

CREATE TABLE IF NOT EXISTS "desktop_basement_attack_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "request_id" uuid NOT NULL,
  "pest_id" uuid NOT NULL REFERENCES "desktop_basement_pests"("id") ON DELETE CASCADE,
  "move_id" varchar(32) NOT NULL,
  "damage" integer NOT NULL,
  "stamina_after" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "desktop_basement_attack_user_request_unique" UNIQUE ("user_id", "request_id"),
  CONSTRAINT "desktop_basement_attack_damage_check" CHECK ("damage" between 0 and 100),
  CONSTRAINT "desktop_basement_attack_stamina_check" CHECK ("stamina_after" between 0 and 100)
);
CREATE INDEX IF NOT EXISTS "desktop_basement_attack_pest_created_idx"
  ON "desktop_basement_attack_events" ("pest_id", "created_at");
