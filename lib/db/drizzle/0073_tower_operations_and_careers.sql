CREATE TABLE IF NOT EXISTS "tower_staff_assignments" (
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(24) NOT NULL,
  "career_level" integer DEFAULT 1 NOT NULL,
  "assigned_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_staff_assignments_role_check" CHECK ("role" in ('operations', 'maintenance', 'security')),
  CONSTRAINT "tower_staff_assignments_career_level_check" CHECK ("career_level" between 1 and 10),
  CONSTRAINT "tower_staff_assignments_user_id_pk" PRIMARY KEY ("user_id")
);

CREATE TABLE IF NOT EXISTS "tower_operations_state" (
  "building_key" varchar(64) DEFAULT 'shadow_tower' NOT NULL,
  "accumulated_trash" integer DEFAULT 0 NOT NULL,
  "incoming_supply_crates" integer DEFAULT 0 NOT NULL,
  "stored_supply_crates" integer DEFAULT 0 NOT NULL,
  "processed_trash" integer DEFAULT 0 NOT NULL,
  "last_trash_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_trash_haul_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_supply_delivery_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_generator_work_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_pump_work_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_operations_state_trash_check" CHECK ("accumulated_trash" between 0 and 1000000),
  CONSTRAINT "tower_operations_state_supplies_check" CHECK ("incoming_supply_crates" between 0 and 1000000),
  CONSTRAINT "tower_operations_state_stored_supplies_check" CHECK ("stored_supply_crates" between 0 and 1000000),
  CONSTRAINT "tower_operations_state_processed_trash_check" CHECK ("processed_trash" between 0 and 1000000),
  CONSTRAINT "tower_operations_state_building_pk" PRIMARY KEY ("building_key")
);

CREATE TABLE IF NOT EXISTS "tower_waste_hauls" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "device_links"("id") ON DELETE CASCADE,
  "units" integer NOT NULL,
  "picked_up_floor" integer NOT NULL,
  "picked_up_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  CONSTRAINT "tower_waste_hauls_units_check" CHECK ("units" between 1 and 100),
  CONSTRAINT "tower_waste_hauls_floor_check" CHECK ("picked_up_floor" in (1, 6)),
  CONSTRAINT "tower_waste_hauls_id_pk" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_waste_hauls_one_active_per_user_idx"
  ON "tower_waste_hauls" ("user_id") WHERE "delivered_at" is null;
CREATE INDEX IF NOT EXISTS "tower_waste_hauls_link_idx"
  ON "tower_waste_hauls" ("link_id", "picked_up_at");

CREATE TABLE IF NOT EXISTS "tower_restroom_sessions" (
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "device_links"("id") ON DELETE CASCADE,
  "floor_number" integer NOT NULL,
  "stall_key" varchar(48) NOT NULL,
  "session_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_restroom_sessions_floor_check" CHECK ("floor_number" in (1, 6)),
  CONSTRAINT "tower_restroom_sessions_user_pk" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_restroom_sessions_stall_unique"
  ON "tower_restroom_sessions" ("floor_number", "stall_key");

CREATE TABLE IF NOT EXISTS "career_positions" (
  "position_key" varchar(220) NOT NULL,
  "employer_key" varchar(120) NOT NULL,
  "title" varchar(160) NOT NULL,
  "department" varchar(80) DEFAULT '' NOT NULL,
  "incumbent_name" varchar(120) NOT NULL,
  "incumbent_since" timestamp with time zone DEFAULT now() NOT NULL,
  "next_turnover_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_turnover_at" timestamp with time zone,
  "baseline_output_units" integer DEFAULT 20 NOT NULL,
  "baseline_attendance_days" integer DEFAULT 18 NOT NULL,
  "baseline_reliability_pct" integer DEFAULT 88 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_positions_output_check" CHECK ("baseline_output_units" between 1 and 1000000),
  CONSTRAINT "career_positions_attendance_check" CHECK ("baseline_attendance_days" between 1 and 31),
  CONSTRAINT "career_positions_reliability_check" CHECK ("baseline_reliability_pct" between 1 and 100),
  CONSTRAINT "career_positions_position_pk" PRIMARY KEY ("position_key")
);
CREATE INDEX IF NOT EXISTS "career_positions_employer_idx" ON "career_positions" ("employer_key");

CREATE TABLE IF NOT EXISTS "career_work_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_key" varchar(180) NOT NULL,
  "position_key" varchar(220) NOT NULL REFERENCES "career_positions"("position_key") ON DELETE CASCADE,
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(16) DEFAULT 'started' NOT NULL,
  "output_units" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "career_work_events_status_check" CHECK ("status" in ('started', 'completed', 'missed')),
  CONSTRAINT "career_work_events_output_check" CHECK ("output_units" between 0 and 1000000),
  CONSTRAINT "career_work_events_completion_check" CHECK (
    ("status" = 'completed' and "completed_at" is not null and "output_units" > 0)
    or ("status" <> 'completed' and "completed_at" is null)
  ),
  CONSTRAINT "career_work_events_id_pk" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "career_work_events_event_key_idx" ON "career_work_events" ("event_key");
CREATE INDEX IF NOT EXISTS "career_work_events_position_user_completed_idx"
  ON "career_work_events" ("position_key", "user_id", "completed_at");
CREATE INDEX IF NOT EXISTS "career_work_events_started_idx"
  ON "career_work_events" ("status", "started_at");

CREATE TABLE IF NOT EXISTS "career_promotions" (
  "employer_key" varchar(120) NOT NULL,
  "position_key" varchar(220) NOT NULL REFERENCES "career_positions"("position_key") ON DELETE CASCADE,
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "level" integer DEFAULT 1 NOT NULL,
  "promoted_at" timestamp with time zone,
  "evaluated_incumbent_since" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "career_promotions_level_check" CHECK ("level" between 1 and 10),
  CONSTRAINT "career_promotions_employer_position_user_pk"
    PRIMARY KEY ("employer_key", "position_key", "user_id")
);
