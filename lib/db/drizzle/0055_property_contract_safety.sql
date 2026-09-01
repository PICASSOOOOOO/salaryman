ALTER TABLE "property_contracts" ADD COLUMN IF NOT EXISTS "ledger_debt_applied_fiat" integer NOT NULL DEFAULT 0;
ALTER TABLE "property_contracts" DROP CONSTRAINT IF EXISTS "property_contracts_nonnegative_state_check";
ALTER TABLE "property_contracts" ADD CONSTRAINT "property_contracts_nonnegative_state_check" CHECK ("missed_payments" >= 0 AND "outstanding_debt_fiat" >= 0 AND "ledger_debt_applied_fiat" >= 0 AND "business_credit_penalty" >= 0);
DO $$ BEGIN
  ALTER TABLE "property_contracts" ADD CONSTRAINT "property_contracts_listing_id_real_estate_listings_id_fk"
    FOREIGN KEY ("listing_id") REFERENCES "real_estate_listings"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "property_contracts_active_building_unique"
  ON "property_contracts" ("listing_id") WHERE "status" IN ('active', 'delinquent', 'defaulted');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "real_estate_listings" WHERE "status" = 'active' AND "building_id" IS NOT NULL GROUP BY "building_id" HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM "real_estate_listings" WHERE "status" = 'active' AND "building_id" IS NULL GROUP BY "server_id", "x", "y", "w", "h" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add active real-estate listing uniqueness indexes: duplicate active building or footprint listings exist; resolve duplicate data first';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "real_estate_active_listing_building_unique"
  ON "real_estate_listings" ("building_id") WHERE "status" = 'active' AND "building_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "real_estate_active_listing_footprint_unique"
  ON "real_estate_listings" ("server_id", "x", "y", "w", "h") WHERE "status" = 'active' AND "building_id" IS NULL;