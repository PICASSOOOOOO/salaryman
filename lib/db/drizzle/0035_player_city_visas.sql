CREATE TABLE IF NOT EXISTS "player_city_visas" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "city_id" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'visa' NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_city_visas_user_city" UNIQUE("user_id","city_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_tax_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "city_id" varchar(64) NOT NULL,
  "period" varchar(7) NOT NULL,
  "net_profit" numeric(14,2) DEFAULT '0' NOT NULL,
  "tax_amount" numeric(14,2) DEFAULT '0' NOT NULL,
  "status" varchar(16) DEFAULT 'owed' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone,
  CONSTRAINT "business_tax_payments_user_city_period" UNIQUE("user_id","city_id","period")
);
--> statement-breakpoint
-- Backfill: grant 'visa' status for every existing player's current city.
-- cityId is stored in save JSONB at data->>'cityId'; fall back to 'minx_city'.
INSERT INTO player_city_visas (user_id, city_id, status, granted_at, updated_at)
SELECT DISTINCT ON (user_id, city_id)
  user_id,
  COALESCE(NULLIF(data->>'cityId',''), 'minx_city') AS city_id,
  'visa'::varchar AS status,
  now() AS granted_at,
  now() AS updated_at
FROM salaryman_saves
ON CONFLICT (user_id, city_id) DO NOTHING;
