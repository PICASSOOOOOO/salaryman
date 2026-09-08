CREATE TABLE IF NOT EXISTS "real_bank_connections" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" varchar NOT NULL,
"provider" varchar(20) DEFAULT 'plaid' NOT NULL,
"item_id" text,
"encrypted_access_token" text NOT NULL,
"institution_id" text,
"institution_name" text,
"accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
"cached_total_usd_cents" integer DEFAULT 0 NOT NULL,
"status" varchar(20) DEFAULT 'connected' NOT NULL,
"last_error" text,
"last_sync_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "real_bank_connections_user_idx" ON "real_bank_connections" USING btree ("user_id");
