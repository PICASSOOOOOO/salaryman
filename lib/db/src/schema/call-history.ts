import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const callHistoryTable = pgTable("call_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  callerName: varchar("caller_name", { length: 64 }),
  recipientNumber: varchar("recipient_number", { length: 32 }).notNull(),
  twilioCallSid: varchar("twilio_call_sid", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("initiated"),
  durationSeconds: integer("duration_seconds").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type CallHistory = typeof callHistoryTable.$inferSelect;
export type InsertCallHistory = typeof callHistoryTable.$inferInsert;
