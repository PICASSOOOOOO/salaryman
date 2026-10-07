ALTER TABLE "world_build_plans"
  ADD COLUMN "target_building_key" varchar(64),
  ADD COLUMN "target_floor_number" integer;

ALTER TABLE "desktop_office_presence"
  DROP CONSTRAINT IF EXISTS "desktop_office_presence_action_check";
ALTER TABLE "desktop_office_presence"
  ADD CONSTRAINT "desktop_office_presence_action_check"
  CHECK ("action" in ('stand', 'walk', 'sit', 'sleep', 'ride', 'stair'));

CREATE TABLE "tower_construction_contributions" (
  "id" serial PRIMARY KEY NOT NULL,
  "plan_id" integer NOT NULL REFERENCES "world_build_plans"("id") ON DELETE CASCADE,
  "task_id" varchar(64) NOT NULL,
  "user_id" varchar(256) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reward_fiat" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_construction_contrib_reward_check" CHECK ("reward_fiat" between 1 and 100000)
);

CREATE UNIQUE INDEX "tower_construction_contrib_plan_task_idx"
  ON "tower_construction_contributions" ("plan_id", "task_id");
CREATE INDEX "tower_construction_contrib_user_created_idx"
  ON "tower_construction_contributions" ("user_id", "created_at");
