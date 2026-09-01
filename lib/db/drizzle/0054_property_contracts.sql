CREATE TABLE IF NOT EXISTS "property_contracts" (
  "id" serial PRIMARY KEY,
  "listing_id" integer NOT NULL REFERENCES "real_estate_listings"("id") ON DELETE RESTRICT,
  "canonical_property_address" varchar(256) NOT NULL,
  "public_slug" varchar(256) NOT NULL,
  "landlord_user_id" varchar(64) NOT NULL,
  "tenant_user_id" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "monthly_rent_fiat" integer NOT NULL,
  "broker_commission_fiat" integer NOT NULL,
  "security_deposit_fiat" integer NOT NULL,
  "signed_market_multiplier" double precision NOT NULL,
  "signed_market_as_of" timestamptz NOT NULL,
  "next_due_at" timestamptz NOT NULL,
  "grace_ends_at" timestamptz,
  "missed_payments" integer NOT NULL DEFAULT 0,
  "outstanding_debt_fiat" integer NOT NULL DEFAULT 0,
  "access_restricted_at" timestamptz,
  "business_credit_penalty" integer NOT NULL DEFAULT 0,
  "request_id" varchar(36) NOT NULL,
  "signed_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  CONSTRAINT "property_contracts_status_check" CHECK ("status" IN ('active', 'delinquent', 'defaulted', 'completed', 'terminated')),
  CONSTRAINT "property_contracts_positive_terms_check" CHECK ("monthly_rent_fiat" > 0 AND "broker_commission_fiat" >= 0 AND "security_deposit_fiat" >= 0 AND "signed_market_multiplier" > 0),
  CONSTRAINT "property_contracts_nonnegative_state_check" CHECK ("missed_payments" >= 0 AND "outstanding_debt_fiat" >= 0 AND "business_credit_penalty" >= 0),
  CONSTRAINT "property_contracts_distinct_parties_check" CHECK ("landlord_user_id" <> "tenant_user_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "property_contracts_request_id_unique" ON "property_contracts" ("request_id");
CREATE INDEX IF NOT EXISTS "property_contracts_tenant_status_idx" ON "property_contracts" ("tenant_user_id", "status");
CREATE INDEX IF NOT EXISTS "property_contracts_due_date_idx" ON "property_contracts" ("next_due_at");
CREATE INDEX IF NOT EXISTS "property_contracts_listing_idx" ON "property_contracts" ("listing_id");

CREATE TABLE IF NOT EXISTS "property_contract_events" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL REFERENCES "property_contracts"("id") ON DELETE RESTRICT,
  "type" varchar(48) NOT NULL,
  "amount_fiat" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "property_contract_events_contract_created_idx" ON "property_contract_events" ("contract_id", "created_at");