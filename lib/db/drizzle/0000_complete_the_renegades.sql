CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar DEFAULT '' NOT NULL,
	"phone" varchar DEFAULT '' NOT NULL,
	"address" varchar DEFAULT '' NOT NULL,
	"age" varchar DEFAULT '' NOT NULL,
	"ethnicity" varchar DEFAULT '' NOT NULL,
	"hometown" varchar DEFAULT '' NOT NULL,
	"timezone" varchar DEFAULT '' NOT NULL,
	"kids" varchar DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memory" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar DEFAULT 'general' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" integer,
	"title" varchar NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"category" varchar DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"company_name" varchar DEFAULT '' NOT NULL,
	"tagline" varchar DEFAULT '' NOT NULL,
	"mission" text DEFAULT '' NOT NULL,
	"primary_color" varchar DEFAULT '#6366f1' NOT NULL,
	"secondary_color" varchar DEFAULT '#8b5cf6' NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL,
	"website" varchar DEFAULT '' NOT NULL,
	"industry" varchar DEFAULT '' NOT NULL,
	"target_audience" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tiers" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"tier" varchar DEFAULT 'free' NOT NULL,
	"granted_by" varchar DEFAULT 'default' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_businesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_name" varchar(32) NOT NULL,
	"business_type" varchar(16) DEFAULT 'minx' NOT NULL,
	"company_name" varchar(80),
	"industry" varchar(60),
	"company_size" varchar(30),
	"contact_email" varchar(120),
	"is_paid" boolean DEFAULT false NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salaryman_saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	"char_name" varchar(64) NOT NULL,
	"char_class" varchar(32) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"salary" integer DEFAULT 0 NOT NULL,
	"last_zone" varchar(64) DEFAULT 'MINX CITY',
	"playtime" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salaryman_saves_user_slot" UNIQUE("user_id","slot_index")
);
--> statement-breakpoint
CREATE TABLE "billboards" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" varchar(64) NOT NULL,
	"owner_player_name" varchar(64),
	"ad_text" text,
	"ad_image_url" text,
	"price_florin" integer DEFAULT 10000 NOT NULL,
	"rented_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billboards_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "applicants" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(200) DEFAULT '' NOT NULL,
	"resume_notes" text DEFAULT '' NOT NULL,
	"source" varchar(100) DEFAULT '' NOT NULL,
	"stage" varchar(20) DEFAULT 'applied' NOT NULL,
	"stage_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"applicant_id" integer,
	"name" varchar(200) NOT NULL,
	"role" varchar(200) DEFAULT '' NOT NULL,
	"salary" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"applicant_id" integer NOT NULL,
	"from_stage" varchar(20) NOT NULL,
	"to_stage" varchar(20) NOT NULL,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zapier_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"webhook_url" text DEFAULT '' NOT NULL,
	"event_new_hire" boolean DEFAULT true NOT NULL,
	"event_new_contact" boolean DEFAULT false NOT NULL,
	"event_weekly_summary" boolean DEFAULT false NOT NULL,
	"event_new_applicant" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zapier_webhooks_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_job_id_job_listings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "applicants_job_id_idx" ON "applicants" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applicants_user_id_idx" ON "applicants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "applicants_stage_idx" ON "applicants" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "job_listings_user_id_idx" ON "job_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_listings_status_idx" ON "job_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_user_id_idx" ON "staff_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_status_idx" ON "staff_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_applicant_id_idx" ON "staff_members" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "stage_transitions_applicant_id_idx" ON "stage_transitions" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "zapier_webhooks_user_id_idx" ON "zapier_webhooks" USING btree ("user_id");