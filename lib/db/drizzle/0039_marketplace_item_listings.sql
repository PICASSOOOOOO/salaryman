CREATE TABLE IF NOT EXISTS "marketplace_item_listings" (
  "id" serial PRIMARY KEY NOT NULL,
  "seller_id" varchar(256) NOT NULL,
  "seller_name" varchar(64) NOT NULL,
  "item_id" varchar(64) NOT NULL,
  "item_name" varchar(120) NOT NULL,
  "quantity" integer NOT NULL,
  "price_fiat" integer NOT NULL,
  "city_id" varchar(32) DEFAULT 'minx_prime' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "art_key" varchar(256),
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_item_listings_status_idx"
  ON "marketplace_item_listings" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_item_listings_city_idx"
  ON "marketplace_item_listings" USING btree ("city_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_item_listings_seller_idx"
  ON "marketplace_item_listings" USING btree ("seller_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_item_listings_item_idx"
  ON "marketplace_item_listings" USING btree ("item_id","status");