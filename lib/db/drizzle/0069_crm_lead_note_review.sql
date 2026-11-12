ALTER TABLE "lead_notes"
  ADD COLUMN IF NOT EXISTS "review_status" varchar(24) NOT NULL DEFAULT 'not_required';
--> statement-breakpoint
ALTER TABLE "lead_notes"
  ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" varchar(256);
--> statement-breakpoint
ALTER TABLE "lead_notes"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "lead_notes"
SET "review_status" = 'needs_review'
WHERE "review_status" = 'not_required'
  AND "note" LIKE '[autopilot:market-research-call-%';
