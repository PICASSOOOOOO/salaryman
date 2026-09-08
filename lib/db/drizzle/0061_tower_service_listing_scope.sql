ALTER TABLE "service_listings"
  ADD COLUMN IF NOT EXISTS "business_key" varchar(64);

CREATE INDEX IF NOT EXISTS "svc_listings_business_idx"
  ON "service_listings" ("business_key", "status");