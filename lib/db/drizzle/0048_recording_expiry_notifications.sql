ALTER TABLE "call_history"
  ADD COLUMN "recording_expiry_notified_at" timestamp with time zone;

UPDATE "call_history"
   SET "recording_retain_until" = "started_at" + interval '1095 days'
 WHERE "recording_url" IS NOT NULL;