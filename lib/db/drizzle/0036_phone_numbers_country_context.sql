ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "country_code" varchar(2);
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "city_id" varchar(40);
--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD COLUMN IF NOT EXISTS "region" varchar(64);