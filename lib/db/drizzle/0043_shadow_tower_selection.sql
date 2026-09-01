CREATE TABLE "shadow_tower_selected_floors" (
  "user_id" varchar PRIMARY KEY NOT NULL,
  "floor_id" integer NOT NULL REFERENCES "shadow_tower_floors"("id") ON DELETE cascade,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shadow_tower_selected_floor_idx" ON "shadow_tower_selected_floors" USING btree ("floor_id");