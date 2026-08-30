WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "user_id", "channel_id"
      ORDER BY "last_read_message_id" DESC NULLS LAST, "updated_at" DESC
    ) AS duplicate_rank
  FROM "chat_read_cursors"
)
DELETE FROM "chat_read_cursors"
USING ranked
WHERE "chat_read_cursors".ctid = ranked.ctid
  AND ranked.duplicate_rank > 1;
--> statement-breakpoint
ALTER TABLE "chat_read_cursors"
  ADD CONSTRAINT "chat_read_cursors_user_channel_unique"
  UNIQUE("user_id", "channel_id");