CREATE TABLE IF NOT EXISTS "org_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL,
  "label" varchar(100) NOT NULL,
  "balance_fiat" bigint DEFAULT 0 NOT NULL,
  "apy_bps" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_account_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "account_type" varchar(20) NOT NULL,
  "delta" bigint NOT NULL,
  "balance_after" bigint DEFAULT 0 NOT NULL,
  "description" varchar(500) DEFAULT '' NOT NULL,
  "category" varchar(60) DEFAULT 'other' NOT NULL,
  "actor_user_id" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_accounts_org_type_unique_idx" ON "org_accounts" ("org_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_accounts_org_id_idx" ON "org_accounts" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_acct_tx_org_id_idx" ON "org_account_transactions" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_acct_tx_account_type_idx" ON "org_account_transactions" ("org_id","account_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_acct_tx_created_at_idx" ON "org_account_transactions" ("created_at");
