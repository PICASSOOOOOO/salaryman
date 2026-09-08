ALTER TABLE "call_history" ADD COLUMN "dialing_session_id" integer;--> statement-breakpoint
ALTER TABLE "call_history" ADD COLUMN "dialing_queue_index" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "call_history_dialing_attempt_unique"
ON "call_history" USING btree ("dialing_session_id", "dialing_queue_index")
WHERE "dialing_session_id" IS NOT NULL AND "dialing_queue_index" IS NOT NULL;