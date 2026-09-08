CREATE TABLE "feature_trials" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"feature_key" varchar(64) NOT NULL,
	"user_id" varchar(255),
	"trial_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_expires_at" timestamp with time zone NOT NULL,
	"trial_days" integer DEFAULT 7 NOT NULL,
	"source" varchar(128) DEFAULT 'feature_trial' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
