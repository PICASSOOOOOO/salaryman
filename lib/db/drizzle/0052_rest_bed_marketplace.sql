CREATE TABLE IF NOT EXISTS "rest_beds" (
  "id" serial PRIMARY KEY,
  "owner_user_id" varchar(256) NOT NULL,
  "org_id" integer REFERENCES "organizations"("id") ON DELETE CASCADE,
  "city_id" varchar(40) NOT NULL,
  "bed_key" varchar(80) NOT NULL,
  "name" varchar(120) NOT NULL,
  "room_type" varchar(24) NOT NULL DEFAULT 'hotel',
  "description" varchar(300),
  "hourly_rate_fiat" integer NOT NULL,
  "stamina_per_hour" integer NOT NULL DEFAULT 35,
  "recharge_consumables" boolean NOT NULL DEFAULT true,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "rest_beds_bed_key_unique_idx" ON "rest_beds" ("bed_key");
CREATE INDEX IF NOT EXISTS "rest_beds_city_active_idx" ON "rest_beds" ("city_id", "active");
CREATE INDEX IF NOT EXISTS "rest_beds_org_idx" ON "rest_beds" ("org_id");

CREATE TABLE IF NOT EXISTS "rest_bed_bookings" (
  "id" serial PRIMARY KEY,
  "bed_id" integer NOT NULL REFERENCES "rest_beds"("id") ON DELETE CASCADE,
  "renter_user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "request_id" varchar(80) NOT NULL,
  "hours" integer NOT NULL,
  "amount_fiat" integer NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "rest_bed_bookings_request_unique_idx" ON "rest_bed_bookings" ("renter_user_id", "request_id");
CREATE INDEX IF NOT EXISTS "rest_bed_bookings_bed_ends_idx" ON "rest_bed_bookings" ("bed_id", "ends_at");