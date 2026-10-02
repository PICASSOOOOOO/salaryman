ALTER TABLE "desktop_work_leases"
  ADD COLUMN IF NOT EXISTS "verified_seconds" integer DEFAULT 0 NOT NULL;

ALTER TABLE "desktop_work_leases"
  ADD COLUMN IF NOT EXISTS "presence_last_seen_at" timestamp with time zone;