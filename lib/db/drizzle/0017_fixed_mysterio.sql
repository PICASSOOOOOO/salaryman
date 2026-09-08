CREATE TABLE "feedback_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) DEFAULT 'Bug' NOT NULL,
	"screenshot_url" text,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"app_version" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_reports_user_id_idx" ON "feedback_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_reports_status_idx" ON "feedback_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_reports_category_idx" ON "feedback_reports" USING btree ("category");
