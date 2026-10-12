ALTER TABLE "shadow_tower_office_units"
  ADD COLUMN IF NOT EXISTS "password_hash" varchar(255);
