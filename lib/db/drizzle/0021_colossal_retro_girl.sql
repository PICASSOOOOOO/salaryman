CREATE TABLE IF NOT EXISTS "bot_oauth_sessions" (
	"nonce" varchar(64) PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_oauth_sessions" ADD CONSTRAINT "bot_oauth_sessions_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
