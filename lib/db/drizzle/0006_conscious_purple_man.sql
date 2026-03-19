CREATE TABLE "deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(500) NOT NULL,
	"stage" varchar(50) DEFAULT 'Lead' NOT NULL,
	"value" integer,
	"contact_id" integer,
	"contact_name" varchar(300),
	"expected_close_date" varchar(20),
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"goal_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"period" varchar(50) DEFAULT 'Quarterly' NOT NULL,
	"target_metric" varchar(200) DEFAULT '' NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"target_value" integer DEFAULT 100 NOT NULL,
	"unit" varchar(50) DEFAULT '%' NOT NULL,
	"deadline" varchar(20),
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_kit" ADD COLUMN "font_primary" varchar DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD COLUMN "font_secondary" varchar DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD COLUMN "tone_of_voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_user_id_idx" ON "deals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "goal_milestones_goal_id_idx" ON "goal_milestones" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_milestones_user_id_idx" ON "goal_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals" USING btree ("status");