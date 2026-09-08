ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "economic_id" uuid DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_economic_id_unique_idx" ON "users" ("economic_id");

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_id" uuid DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_business_id_unique_idx" ON "organizations" ("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_name_canonical_unique_idx"
  ON "organizations" (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));