CREATE TABLE IF NOT EXISTS "player_gold_accounts" (
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "balance_tenths" integer DEFAULT 0 NOT NULL,
  "migration_version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_gold_accounts_pk" PRIMARY KEY("user_id","slot_index"),
  CONSTRAINT "player_gold_accounts_balance_check" CHECK ("balance_tenths" >= 0)
);
--> statement-breakpoint
INSERT INTO "player_gold_accounts" ("user_id", "slot_index", "balance_tenths", "migration_version")
SELECT
  "user_id",
  "slot_index",
  GREATEST(0, LEAST(2147483647, ROUND(
    CASE
      WHEN jsonb_typeof("data"->'goldBalance') = 'number'
      THEN ("data"->>'goldBalance')::numeric * 10
      ELSE 0
    END
  )))::integer,
  1
FROM "salaryman_saves"
ON CONFLICT ("user_id", "slot_index") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gold_conversion_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "side" varchar(8) NOT NULL,
  "gold_tenths" integer NOT NULL,
  "gross_fiat" integer NOT NULL,
  "fee_fiat" integer NOT NULL,
  "settled_fiat" integer NOT NULL,
  "fiat_per_gold" integer NOT NULL,
  "btc_usd_cents" integer NOT NULL,
  "market_source" varchar(32) NOT NULL,
  "market_as_of" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "execution_idempotency_key" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gold_conversion_quotes_side_check" CHECK ("side" in ('buy', 'sell')),
  CONSTRAINT "gold_conversion_quotes_gold_check" CHECK ("gold_tenths" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gold_conversion_quotes_user_slot_idx" ON "gold_conversion_quotes" ("user_id","slot_index","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gold_conversion_quotes_execute_idem_uq" ON "gold_conversion_quotes" ("user_id","slot_index","execution_idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gold_conversion_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "quote_id" uuid NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "side" varchar(8) NOT NULL,
  "gold_delta_tenths" integer NOT NULL,
  "fiat_delta" integer NOT NULL,
  "fee_fiat" integer NOT NULL,
  "gold_balance_after_tenths" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gold_conversion_transactions_user_slot_idx" ON "gold_conversion_transactions" ("user_id","slot_index","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gold_conversion_transactions_idem_uq" ON "gold_conversion_transactions" ("user_id","slot_index","idempotency_key");