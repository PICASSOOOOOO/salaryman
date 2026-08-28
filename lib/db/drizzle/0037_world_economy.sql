CREATE TABLE "world_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "job_id" varchar(64) NOT NULL,
  "building_id" varchar(64) NOT NULL,
  "label" varchar(96) NOT NULL,
  "pay_fiat" integer NOT NULL,
  "duration_ms" integer NOT NULL,
  "cooldown_ms" integer NOT NULL,
  "start_idempotency_key" varchar(128) NOT NULL,
  "complete_idempotency_key" varchar(128),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completes_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "cooldown_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "world_job_runs_user_slot_idx" ON "world_job_runs" USING btree ("user_id","slot_index","started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "world_job_runs_start_idem_uq" ON "world_job_runs" USING btree ("user_id","slot_index","start_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "world_job_runs_complete_idem_uq" ON "world_job_runs" USING btree ("user_id","slot_index","complete_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "world_job_runs_one_active_uq" ON "world_job_runs" USING btree ("user_id","slot_index") WHERE "completed_at" is null;
--> statement-breakpoint
CREATE TABLE "world_cargo" (
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "commodity_id" varchar(64) NOT NULL,
  "quantity" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "world_cargo_pk" PRIMARY KEY("user_id","slot_index","commodity_id"),
  CONSTRAINT "world_cargo_quantity_check" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
CREATE INDEX "world_cargo_user_slot_idx" ON "world_cargo" USING btree ("user_id","slot_index");
--> statement-breakpoint
CREATE TABLE "world_market_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "slot_index" integer NOT NULL,
  "location" varchar(16) NOT NULL,
  "commodity_id" varchar(64) NOT NULL,
  "side" varchar(8) NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price_fiat" integer NOT NULL,
  "total_fiat" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "execution_idempotency_key" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "world_market_quotes_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "world_market_quotes_side_check" CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "world_market_quotes_location_check" CHECK ("location" IN ('city', 'waste'))
);
--> statement-breakpoint
CREATE INDEX "world_market_quotes_user_slot_idx" ON "world_market_quotes" USING btree ("user_id","slot_index","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "world_market_quotes_execute_idem_uq" ON "world_market_quotes" USING btree ("user_id","slot_index","execution_idempotency_key");
--> statement-breakpoint
CREATE TABLE "world_player_positions" (
  "user_id" varchar(256) NOT NULL,
  "city_id" varchar(40) NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "world_player_positions_pk" PRIMARY KEY("user_id","city_id")
);
--> statement-breakpoint
CREATE INDEX "world_player_positions_updated_idx" ON "world_player_positions" USING btree ("updated_at");