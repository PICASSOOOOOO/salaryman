CREATE TABLE IF NOT EXISTS "brand_factions" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shop_location_bosses" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "brand_id" varchar(128) NOT NULL,
  "shop_id" varchar(128) NOT NULL,
  "location_id" varchar(128) NOT NULL,
  "net_worth_fiat" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shop_location_bosses_brand_id_brand_factions_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "brand_factions"("id") ON DELETE RESTRICT,
  CONSTRAINT "shop_location_bosses_net_worth_nonnegative" CHECK ("net_worth_fiat" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "shop_location_bosses_location_unique_idx"
  ON "shop_location_bosses" ("location_id");
CREATE INDEX IF NOT EXISTS "shop_location_bosses_brand_shop_idx"
  ON "shop_location_bosses" ("brand_id", "shop_id");
