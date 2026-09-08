ALTER TABLE "shadow_tower_floors"
  ALTER COLUMN "office_count" SET DEFAULT 1;

ALTER TABLE "shadow_tower_floors"
  DROP CONSTRAINT IF EXISTS "shadow_tower_floors_office_count_check";

ALTER TABLE "shadow_tower_floors"
  ADD CONSTRAINT "shadow_tower_floors_office_count_check"
  CHECK ("office_count" BETWEEN 1 AND 4);