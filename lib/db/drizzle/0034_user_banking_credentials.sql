CREATE TABLE IF NOT EXISTS "user_banking_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar(20) DEFAULT 'plaid' NOT NULL,
	"encrypted_client_id" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"env" varchar(20) DEFAULT 'sandbox' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_banking_credentials_user_idx" ON "user_banking_credentials" USING btree ("user_id");
