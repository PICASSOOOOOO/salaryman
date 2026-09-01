ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_connect_account_unique"
  ON "users" ("stripe_connect_account_id")
  WHERE "stripe_connect_account_id" IS NOT NULL;