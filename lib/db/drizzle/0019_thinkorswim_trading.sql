CREATE TABLE IF NOT EXISTS "bot_trade_strategies" (
        "id" serial PRIMARY KEY NOT NULL,
        "bot_id" integer NOT NULL,
        "strategy_type" varchar(50) NOT NULL,
        "enabled" boolean DEFAULT false NOT NULL,
        "parameters" jsonb DEFAULT '{}' NOT NULL,
        "max_daily_loss" integer DEFAULT 500 NOT NULL,
        "max_daily_loss_percent" integer DEFAULT 5 NOT NULL,
        "max_position_size" integer DEFAULT 1000 NOT NULL,
        "max_concurrent_trades" integer DEFAULT 3 NOT NULL,
        "stop_loss_percent" integer DEFAULT 2 NOT NULL,
        "trailing_stop_percent" integer DEFAULT 0 NOT NULL,
        "kill_switch" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_trade_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "bot_id" integer NOT NULL,
        "strategy_type" varchar(50) NOT NULL,
        "symbol" text NOT NULL,
        "side" varchar(10) NOT NULL,
        "quantity" integer NOT NULL,
        "entry_price" integer NOT NULL,
        "exit_price" integer,
        "pnl" integer,
        "is_paper" boolean DEFAULT true NOT NULL,
        "status" varchar(20) DEFAULT 'open' NOT NULL,
        "order_id" text,
        "peak_price" integer,
        "signal" jsonb DEFAULT '{}' NOT NULL,
        "closed_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_trading_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "bot_id" integer NOT NULL,
        "schwab_account_hash" text,
        "schwab_account_number" text,
        "encrypted_access_token" text,
        "encrypted_refresh_token" text,
        "token_expires_at" timestamp with time zone,
        "is_paper_mode" boolean DEFAULT true NOT NULL,
        "cached_balance" integer,
        "cached_equity" integer,
        "daily_pnl" integer DEFAULT 0 NOT NULL,
        "last_sync_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "bot_trading_accounts_bot_id_unique" UNIQUE("bot_id")
);
--> statement-breakpoint
ALTER TABLE "bot_trade_strategies" ADD CONSTRAINT "bot_trade_strategies_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bot_trade_log" ADD CONSTRAINT "bot_trade_log_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bot_trading_accounts" ADD CONSTRAINT "bot_trading_accounts_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
