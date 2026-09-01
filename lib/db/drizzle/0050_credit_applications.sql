CREATE TABLE IF NOT EXISTS "credit_applications" (
  "id" serial PRIMARY KEY NOT NULL,
  "applicant_user_id" varchar(64) NOT NULL,
  "org_id" integer REFERENCES "organizations"("id") ON DELETE SET NULL,
  "scope" varchar(16) DEFAULT 'individual' NOT NULL,
  "product" varchar(20) NOT NULL,
  "requested_fiat" integer NOT NULL,
  "approved_fiat" integer DEFAULT 0 NOT NULL,
  "apr_bps" integer DEFAULT 1500 NOT NULL,
  "term_months" integer DEFAULT 12 NOT NULL,
  "purpose" text DEFAULT '' NOT NULL,
  "applicant_score" integer DEFAULT 0 NOT NULL,
  "org_score" integer,
  "org_age_days" integer,
  "monthly_income_fiat" integer DEFAULT 0 NOT NULL,
  "consistency_score" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewer_user_id" varchar(64),
  "reviewer_notes" text,
  "decision_at" timestamptz,
  "funded_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "credit_usage_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "application_id" integer REFERENCES "credit_applications"("id") ON DELETE SET NULL,
  "applicant_user_id" varchar(64) NOT NULL,
  "org_id" integer REFERENCES "organizations"("id") ON DELETE SET NULL,
  "event_type" varchar(40) NOT NULL,
  "amount_fiat" integer DEFAULT 0 NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "credit_applications_applicant_idx" ON "credit_applications" ("applicant_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_applications_org_idx" ON "credit_applications" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_applications_status_idx" ON "credit_applications" ("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_applications_one_pending_per_user_idx" ON "credit_applications" ("applicant_user_id") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "credit_usage_events_applicant_idx" ON "credit_usage_events" ("applicant_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_usage_events_org_idx" ON "credit_usage_events" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_usage_events_application_idx" ON "credit_usage_events" ("application_id", "created_at");