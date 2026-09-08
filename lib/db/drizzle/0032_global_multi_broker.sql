CREATE TABLE IF NOT EXISTS "bot_broker_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"broker" varchar(30) NOT NULL,
	"label" text,
	"encrypted_credentials" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"is_paper_mode" boolean DEFAULT true NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"account_identifier" text,
	"cached_balance_native" integer,
	"cached_equity_native" integer,
	"daily_pnl_native" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'connected' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trading_data_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar(20) NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bot_broker_connections" ADD CONSTRAINT "bot_broker_connections_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bot_broker_connections_bot_broker_idx" ON "bot_broker_connections" USING btree ("bot_id","broker");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trading_data_providers_user_idx" ON "trading_data_providers" USING btree ("user_id");
