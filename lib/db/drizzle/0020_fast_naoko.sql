ALTER TABLE "bot_trade_log" ADD COLUMN IF NOT EXISTS "asset_type" varchar(10) DEFAULT 'EQUITY' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dev_task_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"dev_task_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dev_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"feedback_report_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" varchar,
	"escalated" boolean DEFAULT false NOT NULL,
	"escalated_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dev_task_notes" ADD CONSTRAINT "dev_task_notes_dev_task_id_dev_tasks_id_fk" FOREIGN KEY ("dev_task_id") REFERENCES "public"."dev_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_feedback_report_id_feedback_reports_id_fk" FOREIGN KEY ("feedback_report_id") REFERENCES "public"."feedback_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_task_notes_task_id_idx" ON "dev_task_notes" USING btree ("dev_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_tasks_feedback_report_id_idx" ON "dev_tasks" USING btree ("feedback_report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_tasks_status_idx" ON "dev_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_tasks_priority_idx" ON "dev_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_tasks_assigned_to_idx" ON "dev_tasks" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_tasks_escalated_idx" ON "dev_tasks" USING btree ("escalated");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bot_scheduled_tasks_bot_id_description_idx" ON "bot_scheduled_tasks" USING btree ("bot_id","task_description");
