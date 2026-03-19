CREATE TABLE "contact_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar(30) DEFAULT 'note' NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_performance_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"item" varchar(300) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"template_type" varchar(50) NOT NULL,
	"party_a" varchar(300) NOT NULL,
	"party_b" varchar(300) NOT NULL,
	"start_date" varchar(20) DEFAULT '' NOT NULL,
	"end_date" varchar(20) DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"compensation" varchar(500) DEFAULT '' NOT NULL,
	"jurisdiction" varchar(200) DEFAULT '' NOT NULL,
	"extra_clauses" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(300) NOT NULL,
	"parent_id" integer,
	"is_folder" boolean DEFAULT false NOT NULL,
	"object_path" varchar(1000),
	"mime_type" varchar(200),
	"file_size" integer,
	"is_public" boolean DEFAULT false NOT NULL,
	"share_token" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"client_name" varchar(300) NOT NULL,
	"client_email" varchar(300) DEFAULT '' NOT NULL,
	"client_address" text DEFAULT '' NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"issue_date" varchar(20) NOT NULL,
	"due_date" varchar(20) NOT NULL,
	"line_items" json DEFAULT '[]'::json NOT NULL,
	"tax_rate" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" varchar(300) DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reminder_minutes" integer DEFAULT 15 NOT NULL,
	"google_event_id" varchar(300),
	"google_calendar_synced" boolean DEFAULT false NOT NULL,
	"reminder_email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"caller_name" varchar(64),
	"recipient_number" varchar(32) NOT NULL,
	"twilio_call_sid" varchar(64),
	"status" varchar(32) DEFAULT 'initiated' NOT NULL,
	"duration_seconds" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "tag" varchar(50) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "deal_stage" varchar(50) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "deal_value" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company" varchar DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "department" varchar(100) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "offboarding_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_performance_notes" ADD CONSTRAINT "employee_performance_notes_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_interactions_contact_id_idx" ON "contact_interactions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_interactions_user_id_idx" ON "contact_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "perf_notes_staff_id_idx" ON "employee_performance_notes" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "perf_notes_user_id_idx" ON "employee_performance_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_staff_id_idx" ON "onboarding_checklists" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "onboarding_user_id_idx" ON "onboarding_checklists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contracts_user_id_idx" ON "contracts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contracts_template_idx" ON "contracts" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "files_folders_user_id_idx" ON "files_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "files_folders_parent_id_idx" ON "files_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "files_folders_share_token_idx" ON "files_folders" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_user_id_idx" ON "appointments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointments_start_at_idx" ON "appointments" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "appointments_google_event_id_idx" ON "appointments" USING btree ("google_event_id");--> statement-breakpoint
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contacts_tag_idx" ON "contacts" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "contacts_deal_stage_idx" ON "contacts" USING btree ("deal_stage");