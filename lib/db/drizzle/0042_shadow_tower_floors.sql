CREATE TABLE "shadow_tower_floors" (
  "id" serial PRIMARY KEY NOT NULL,
  "city" varchar(20) NOT NULL,
  "floor_number" integer NOT NULL,
  "org_id" integer REFERENCES "organizations"("id") ON DELETE cascade,
  "owner_user_id" varchar,
  "tenure" varchar(12) NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "archetype" varchar(24) NOT NULL,
  "min_access_role" varchar(20) DEFAULT 'specialist' NOT NULL,
  "access_permission" varchar(60) DEFAULT 'org.settings' NOT NULL,
  "password_hash" varchar(255),
  "classification" varchar(40) DEFAULT 'internal' NOT NULL,
  "upgrades" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shadow_tower_city_check" CHECK ("city" IN ('minx_city', 'huda_city')),
  CONSTRAINT "shadow_tower_floor_number_check" CHECK ("floor_number" BETWEEN 1 AND 120),
  CONSTRAINT "shadow_tower_owner_check" CHECK (("org_id" IS NULL) <> ("owner_user_id" IS NULL)),
  CONSTRAINT "shadow_tower_tenure_check" CHECK ("tenure" IN ('own', 'lease')),
  CONSTRAINT "shadow_tower_lease_check" CHECK (("tenure" = 'own' AND "lease_expires_at" IS NULL) OR ("tenure" = 'lease' AND "lease_expires_at" IS NOT NULL)),
  CONSTRAINT "shadow_tower_archetype_check" CHECK ("archetype" IN ('founder_team', 'company'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_tower_floors_city_number_unique" ON "shadow_tower_floors" USING btree ("city","floor_number");
--> statement-breakpoint
CREATE INDEX "shadow_tower_floors_org_idx" ON "shadow_tower_floors" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "shadow_tower_floors_personal_owner_idx" ON "shadow_tower_floors" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "shadow_tower_floors_lease_expiry_idx" ON "shadow_tower_floors" USING btree ("lease_expires_at");
--> statement-breakpoint
CREATE TABLE "shadow_tower_workstation_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "floor_id" integer NOT NULL REFERENCES "shadow_tower_floors"("id") ON DELETE cascade,
  "workstation_key" varchar(64) NOT NULL,
  "assignee_type" varchar(12) NOT NULL,
  "assignee_user_id" varchar,
  "bot_id" integer,
  "assigned_by_user_id" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shadow_tower_assignment_type_check" CHECK ("assignee_type" IN ('human', 'bot')),
  CONSTRAINT "shadow_tower_assignment_target_check" CHECK (("assignee_type" = 'human' AND "assignee_user_id" IS NOT NULL AND "bot_id" IS NULL) OR ("assignee_type" = 'bot' AND "bot_id" IS NOT NULL AND "assignee_user_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_tower_assignment_station_unique" ON "shadow_tower_workstation_assignments" USING btree ("floor_id","workstation_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_tower_assignment_human_unique" ON "shadow_tower_workstation_assignments" USING btree ("floor_id","assignee_user_id") WHERE "assignee_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_tower_assignment_bot_unique" ON "shadow_tower_workstation_assignments" USING btree ("floor_id","bot_id") WHERE "bot_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "shadow_tower_assignment_floor_idx" ON "shadow_tower_workstation_assignments" USING btree ("floor_id");