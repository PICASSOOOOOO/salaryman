ALTER TABLE "art_assets" ADD COLUMN IF NOT EXISTS "job_type" varchar(16);--> statement-breakpoint
ALTER TABLE "art_assets" ADD COLUMN IF NOT EXISTS "media_type" varchar(16) DEFAULT 'image' NOT NULL;
