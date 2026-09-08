DELETE FROM "sms_messages" newer
USING "sms_messages" older
WHERE newer."twilio_message_sid" IS NOT NULL
  AND newer."twilio_message_sid" = older."twilio_message_sid"
  AND newer."id" > older."id";--> statement-breakpoint
CREATE UNIQUE INDEX "sms_messages_twilio_sid_unique"
ON "sms_messages" USING btree ("twilio_message_sid")
WHERE "twilio_message_sid" IS NOT NULL;