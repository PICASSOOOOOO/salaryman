CREATE UNIQUE INDEX IF NOT EXISTS "call_history_twilio_sid_unique"
ON "call_history" ("twilio_call_sid")
WHERE "twilio_call_sid" IS NOT NULL;