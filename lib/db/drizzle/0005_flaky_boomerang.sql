CREATE TABLE "conference_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"room_name" varchar(128) NOT NULL,
	"twilio_conference_sid" varchar(64),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"participants_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dialing_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"mode" varchar(32) DEFAULT 'power' NOT NULL,
	"status" varchar(32) DEFAULT 'idle' NOT NULL,
	"total_numbers" integer DEFAULT 0 NOT NULL,
	"dialed_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"queue_json" text,
	"settings_json" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"number" varchar(32) NOT NULL,
	"friendly_name" varchar(128),
	"label" varchar(64) DEFAULT 'main' NOT NULL,
	"twilio_sid" varchar(64),
	"greeting" text,
	"routing_mode" varchar(32) DEFAULT 'voicemail' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secretary_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"personality" varchar(64) DEFAULT 'professional' NOT NULL,
	"greeting_script" text,
	"screening_rules" text,
	"business_hours_start" varchar(8) DEFAULT '09:00' NOT NULL,
	"business_hours_end" varchar(8) DEFAULT '17:00' NOT NULL,
	"business_days" varchar(32) DEFAULT '1,2,3,4,5' NOT NULL,
	"routing_instructions" text,
	"forward_to_number" varchar(32),
	"after_hours_action" varchar(32) DEFAULT 'voicemail' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secretary_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "voicemails" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"from_number" varchar(32) NOT NULL,
	"from_name" varchar(128),
	"twilio_call_sid" varchar(64),
	"recording_url" varchar(512),
	"recording_sid" varchar(64),
	"duration_seconds" integer DEFAULT 0,
	"transcript" text,
	"summary" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "direction" varchar(16) DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "call_type" varchar(32) DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "recording_url" varchar(512);--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "calendar_event_id" integer;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "contact_id" integer;