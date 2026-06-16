ALTER TABLE "player_profiles" ADD COLUMN IF NOT EXISTS "responder_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "player_profiles" ADD COLUMN IF NOT EXISTS "emergency_earnings" integer DEFAULT 0 NOT NULL;
