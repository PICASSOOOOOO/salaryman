CREATE TABLE "donations" (
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
CREATE INDEX "donations_user_id_idx" ON "donations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "donations_stripe_session_idx" ON "donations" USING btree ("stripe_session_id");
