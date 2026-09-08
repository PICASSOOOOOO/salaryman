CREATE TABLE "contact_channel_prefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"email_opt_in" boolean DEFAULT true NOT NULL,
	"sms_opt_in" boolean DEFAULT true NOT NULL,
	"email_opted_out_at" timestamp with time zone,
	"sms_opted_out_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"contact_id" integer,
	"email" varchar(256) NOT NULL,
	"name" varchar(256) DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(256),
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"subject" varchar(512) DEFAULT '' NOT NULL,
	"preview_text" varchar(256) DEFAULT '' NOT NULL,
	"html_body" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"from_name" varchar(128) DEFAULT '' NOT NULL,
	"reply_to" varchar(256) DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_filter" jsonb DEFAULT '{}'::jsonb,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_bounced" integer DEFAULT 0 NOT NULL,
	"total_unsubscribed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_campaign_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"contact_id" integer,
	"phone" varchar(32) NOT NULL,
	"name" varchar(256) DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"twilio_message_sid" varchar(64),
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"message_body" text DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_filter" jsonb DEFAULT '{}'::jsonb,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"contact_id" integer,
	"contact_phone" varchar(32) NOT NULL,
	"contact_name" varchar(256) DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"body" text NOT NULL,
	"from_phone" varchar(32) NOT NULL,
	"to_phone" varchar(32) NOT NULL,
	"twilio_message_sid" varchar(64),
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salaryman_saves" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaign_recipients" ADD CONSTRAINT "sms_campaign_recipients_campaign_id_sms_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sms_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_conversation_id_sms_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_channel_prefs_contact_id_idx" ON "contact_channel_prefs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_channel_prefs_user_id_idx" ON "contact_channel_prefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_campaign_recipients_campaign_id_idx" ON "email_campaign_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_campaign_recipients_email_idx" ON "email_campaign_recipients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_campaigns_user_id_idx" ON "email_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_campaign_recipients_campaign_id_idx" ON "sms_campaign_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "sms_campaign_recipients_phone_idx" ON "sms_campaign_recipients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "sms_campaigns_user_id_idx" ON "sms_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_campaigns_status_idx" ON "sms_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_conversations_user_id_idx" ON "sms_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_conversations_phone_idx" ON "sms_conversations" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX "sms_messages_conversation_id_idx" ON "sms_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "sms_messages_user_id_idx" ON "sms_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_messages_twilio_sid_idx" ON "sms_messages" USING btree ("twilio_message_sid");