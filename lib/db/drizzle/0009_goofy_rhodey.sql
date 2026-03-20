CREATE TABLE IF NOT EXISTS "user_features" (
        "user_id" varchar NOT NULL,
        "feature_key" varchar NOT NULL,
        "granted_by" varchar DEFAULT 'stripe' NOT NULL,
        "stripe_subscription_id" varchar,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "user_features_user_id_feature_key_pk" PRIMARY KEY("user_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cosmetic_catalog" (
        "id" varchar(64) PRIMARY KEY NOT NULL,
        "name" varchar(128) NOT NULL,
        "category" varchar(32) NOT NULL,
        "description" text NOT NULL,
        "price_crypto" integer NOT NULL,
        "rarity" varchar(16) DEFAULT 'common' NOT NULL,
        "color_hex" varchar(16),
        "icon_emoji" varchar(8),
        "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crypto_purchases" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "bundle_id" varchar(64) NOT NULL,
        "crypto_amount" integer NOT NULL,
        "amount_cents" integer NOT NULL,
        "stripe_session_id" varchar(256),
        "status" varchar(32) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_cosmetics" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "cosmetic_id" varchar(64) NOT NULL,
        "equipped" boolean DEFAULT false NOT NULL,
        "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "player_cosmetics_user_item" UNIQUE("user_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_crypto_balance" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "balance" integer DEFAULT 0 NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "player_crypto_balance_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "donations" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "stripe_session_id" varchar(256) NOT NULL,
        "amount_cents" integer NOT NULL,
        "tier" varchar(64),
        "status" varchar(32) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "donations_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salaryman_player_missions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "season_id" integer NOT NULL,
        "mission_id" varchar(64) NOT NULL,
        "period_key" varchar(32) NOT NULL,
        "progress" integer DEFAULT 0 NOT NULL,
        "completed" boolean DEFAULT false NOT NULL,
        "xp_awarded" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "salaryman_player_missions_unique" UNIQUE("user_id","season_id","mission_id","period_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salaryman_player_pass" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" varchar(256) NOT NULL,
        "season_id" integer NOT NULL,
        "xp" integer DEFAULT 0 NOT NULL,
        "current_level" integer DEFAULT 1 NOT NULL,
        "is_premium" boolean DEFAULT false NOT NULL,
        "premium_purchased_at" timestamp with time zone,
        "stripe_session_id" varchar(256),
        "claimed_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "salaryman_player_pass_user_season" UNIQUE("user_id","season_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salaryman_seasons" (
        "id" serial PRIMARY KEY NOT NULL,
        "slug" varchar(64) NOT NULL,
        "name" varchar(128) NOT NULL,
        "number" integer NOT NULL,
        "starts_at" timestamp with time zone NOT NULL,
        "ends_at" timestamp with time zone NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "premium_price_usd" integer DEFAULT 999 NOT NULL,
        "stripe_price_id" varchar(128),
        "tiers" jsonb NOT NULL,
        "missions" jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "salaryman_seasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
        "id" serial PRIMARY KEY NOT NULL,
        "room_code" varchar(32) NOT NULL,
        "title" varchar(300) NOT NULL,
        "host_user_id" varchar NOT NULL,
        "host_name" varchar(100) DEFAULT '' NOT NULL,
        "max_guests" integer DEFAULT 6 NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "appointment_id" integer,
        CONSTRAINT "meetings_room_code_unique" UNIQUE("room_code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_user_id_idx" ON "donations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_stripe_session_idx" ON "donations" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_room_code_idx" ON "meetings" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_host_user_id_idx" ON "meetings" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_expires_at_idx" ON "meetings" USING btree ("expires_at");
