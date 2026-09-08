ALTER TABLE "shadow_tower_floors" ADD COLUMN IF NOT EXISTS "office_count" integer NOT NULL DEFAULT 2;
ALTER TABLE "shadow_tower_floors" ADD CONSTRAINT "shadow_tower_floors_office_count_check" CHECK ("office_count" BETWEEN 2 AND 4);

CREATE TABLE IF NOT EXISTS "shadow_tower_office_units" (
  "id" serial PRIMARY KEY,
  "floor_id" integer NOT NULL REFERENCES "shadow_tower_floors"("id") ON DELETE CASCADE,
  "unit_number" integer NOT NULL,
  "status" varchar(24) NOT NULL,
  "org_id" integer REFERENCES "organizations"("id") ON DELETE SET NULL,
  "owner_user_id" varchar,
  "tenure" varchar(12),
  "lease_expires_at" timestamptz,
  "sale_fiat" integer,
  "lease_fiat" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "shadow_tower_office_units_number_check" CHECK ("unit_number" BETWEEN 1 AND 4),
  CONSTRAINT "shadow_tower_office_units_status_check" CHECK ("status" IN ('owner_priority', 'under_construction', 'for_sale', 'for_lease', 'occupied'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "shadow_tower_office_units_floor_number_unique" ON "shadow_tower_office_units" ("floor_id", "unit_number");
CREATE INDEX IF NOT EXISTS "shadow_tower_office_units_floor_idx" ON "shadow_tower_office_units" ("floor_id");

INSERT INTO "shadow_tower_office_units" ("floor_id", "unit_number", "status", "org_id", "owner_user_id", "tenure", "lease_expires_at")
SELECT f.id, u.unit_number,
  CASE u.unit_number WHEN 1 THEN 'occupied' WHEN 2 THEN 'owner_priority' ELSE 'under_construction' END,
  CASE WHEN u.unit_number = 1 THEN f.org_id ELSE NULL END,
  CASE WHEN u.unit_number = 1 THEN f.owner_user_id ELSE NULL END,
  CASE WHEN u.unit_number = 1 THEN f.tenure ELSE NULL END,
  CASE WHEN u.unit_number = 1 THEN f.lease_expires_at ELSE NULL END
FROM "shadow_tower_floors" f CROSS JOIN (VALUES (1), (2), (3), (4)) AS u(unit_number)
ON CONFLICT ("floor_id", "unit_number") DO NOTHING;