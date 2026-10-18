CREATE TABLE IF NOT EXISTS game_business_orgs (
  id SERIAL PRIMARY KEY,
  owner_user_id VARCHAR(256) NOT NULL,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  city_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  treasury_fiat BIGINT NOT NULL DEFAULT 0,
  treasury_gold BIGINT NOT NULL DEFAULT 0,
  collections_started_at TIMESTAMPTZ,
  requalifies_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_business_orgs_owner_name_city_unique_idx
  ON game_business_orgs(owner_user_id, name, city_id);
CREATE INDEX IF NOT EXISTS game_business_orgs_status_idx
  ON game_business_orgs(status, collections_started_at);

CREATE TABLE IF NOT EXISTS game_business_org_members (
  org_id INTEGER NOT NULL REFERENCES game_business_orgs(id) ON DELETE CASCADE,
  user_id VARCHAR(256) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_business_org_members_org_user_unique_idx
  ON game_business_org_members(org_id, user_id);
CREATE INDEX IF NOT EXISTS game_business_org_members_user_idx
  ON game_business_org_members(user_id);

CREATE TABLE IF NOT EXISTS game_business_income_events (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES game_business_orgs(id) ON DELETE CASCADE,
  currency VARCHAR(16) NOT NULL,
  income_type VARCHAR(16) NOT NULL,
  amount BIGINT NOT NULL,
  source VARCHAR(64) NOT NULL,
  request_id VARCHAR(128) NOT NULL,
  actor_user_id VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_business_income_events_org_request_unique_idx
  ON game_business_income_events(org_id, request_id);
CREATE INDEX IF NOT EXISTS game_business_income_events_org_created_idx
  ON game_business_income_events(org_id, created_at);

CREATE TABLE IF NOT EXISTS game_business_tax_assessments (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES game_business_orgs(id) ON DELETE CASCADE,
  tax_date DATE NOT NULL,
  currency VARCHAR(16) NOT NULL,
  rate_bps INTEGER NOT NULL,
  taxable_gross_income BIGINT NOT NULL DEFAULT 0,
  tax_amount BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'owed',
  due_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_business_tax_assessments_org_day_currency_unique_idx
  ON game_business_tax_assessments(org_id, tax_date, currency);
CREATE INDEX IF NOT EXISTS game_business_tax_assessments_status_due_idx
  ON game_business_tax_assessments(status, due_at);
