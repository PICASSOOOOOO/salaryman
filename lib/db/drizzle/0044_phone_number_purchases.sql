CREATE TABLE IF NOT EXISTS "phone_number_purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar(256) NOT NULL,
  "stripe_session_id" varchar(256) NOT NULL,
  "phone_number" varchar(32) NOT NULL,
  "country_code" varchar(2) NOT NULL,
  "label" varchar(64) DEFAULT 'main' NOT NULL,
  "amount_cents" integer DEFAULT 1000 NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "twilio_sid" varchar(64),
  "failure_reason" varchar(256),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "phone_number_purchases_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_purchases_user_idx" ON "phone_number_purchases" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_purchases_session_idx" ON "phone_number_purchases" USING btree ("stripe_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_number_purchases_number_idx" ON "phone_number_purchases" USING btree ("phone_number");