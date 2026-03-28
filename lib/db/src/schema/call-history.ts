import { pgTable, serial, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";

export const callHistoryTable = pgTable("call_history", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  callerName: varchar("caller_name", { length: 64 }),
  recipientNumber: varchar("recipient_number", { length: 32 }).notNull(),
  twilioCallSid: varchar("twilio_call_sid", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("initiated"),
  direction: varchar("direction", { length: 16 }).notNull().default("outbound"),
  callType: varchar("call_type", { length: 32 }).notNull().default("single"),
  durationSeconds: integer("duration_seconds").default(0),
  transcript: text("transcript"),
  summary: text("summary"),
  recordingUrl: varchar("recording_url", { length: 512 }),
  notes: text("notes"),
  calendarEventId: integer("calendar_event_id"),
  contactId: integer("contact_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type CallHistory = typeof callHistoryTable.$inferSelect;
export type InsertCallHistory = typeof callHistoryTable.$inferInsert;

export const voicemailsTable = pgTable("voicemails", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  fromNumber: varchar("from_number", { length: 32 }).notNull(),
  fromName: varchar("from_name", { length: 128 }),
  twilioCallSid: varchar("twilio_call_sid", { length: 64 }),
  recordingUrl: varchar("recording_url", { length: 512 }),
  recordingSid: varchar("recording_sid", { length: 64 }),
  durationSeconds: integer("duration_seconds").default(0),
  transcript: text("transcript"),
  summary: text("summary"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Voicemail = typeof voicemailsTable.$inferSelect;
export type InsertVoicemail = typeof voicemailsTable.$inferInsert;

export const phoneNumbersTable = pgTable("phone_numbers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  number: varchar("number", { length: 32 }).notNull(),
  friendlyName: varchar("friendly_name", { length: 128 }),
  label: varchar("label", { length: 64 }).notNull().default("main"),
  twilioSid: varchar("twilio_sid", { length: 64 }),
  greeting: text("greeting"),
  routingMode: varchar("routing_mode", { length: 32 }).notNull().default("voicemail"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PhoneNumber = typeof phoneNumbersTable.$inferSelect;
export type InsertPhoneNumber = typeof phoneNumbersTable.$inferInsert;

export const secretaryConfigTable = pgTable("secretary_config", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  personality: varchar("personality", { length: 64 }).notNull().default("professional"),
  greetingScript: text("greeting_script"),
  screeningRules: text("screening_rules"),
  businessHoursStart: varchar("business_hours_start", { length: 8 }).notNull().default("09:00"),
  businessHoursEnd: varchar("business_hours_end", { length: 8 }).notNull().default("17:00"),
  businessDays: varchar("business_days", { length: 32 }).notNull().default("1,2,3,4,5"),
  routingInstructions: text("routing_instructions"),
  forwardToNumber: varchar("forward_to_number", { length: 32 }),
  afterHoursAction: varchar("after_hours_action", { length: 32 }).notNull().default("voicemail"),
  autoAnswer: boolean("auto_answer").notNull().default(false),
  qualificationQuestions: text("qualification_questions"),
  transferRouting: text("transfer_routing"),
  outboundScript: text("outbound_script"),
  outboundSchedule: text("outbound_schedule"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SecretaryConfig = typeof secretaryConfigTable.$inferSelect;
export type InsertSecretaryConfig = typeof secretaryConfigTable.$inferInsert;

export const dialingSessionsTable = pgTable("dialing_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull().default("power"),
  status: varchar("status", { length: 32 }).notNull().default("idle"),
  totalNumbers: integer("total_numbers").notNull().default(0),
  dialedCount: integer("dialed_count").notNull().default(0),
  answeredCount: integer("answered_count").notNull().default(0),
  queueJson: text("queue_json"),
  settingsJson: text("settings_json"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type DialingSession = typeof dialingSessionsTable.$inferSelect;
export type InsertDialingSession = typeof dialingSessionsTable.$inferInsert;

export const conferenceRoomsTable = pgTable("conference_rooms", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  roomName: varchar("room_name", { length: 128 }).notNull(),
  twilioConferenceSid: varchar("twilio_conference_sid", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  participantsJson: text("participants_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type ConferenceRoom = typeof conferenceRoomsTable.$inferSelect;
export type InsertConferenceRoom = typeof conferenceRoomsTable.$inferInsert;

export const pabloCallSessionsTable = pgTable("pablo_call_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  twilioCallSid: varchar("twilio_call_sid", { length: 64 }).notNull(),
  callerNumber: varchar("caller_number", { length: 32 }).notNull(),
  callerName: varchar("caller_name", { length: 128 }),
  direction: varchar("direction", { length: 16 }).notNull().default("inbound"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  conversationJson: text("conversation_json").notNull().default("[]"),
  extractedInfoJson: text("extracted_info_json"),
  outcome: varchar("outcome", { length: 64 }),
  contactId: integer("contact_id"),
  turnCount: integer("turn_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type PabloCallSession = typeof pabloCallSessionsTable.$inferSelect;
export type InsertPabloCallSession = typeof pabloCallSessionsTable.$inferInsert;

export const pabloOutboundCampaignsTable = pgTable("pablo_outbound_campaigns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  script: text("script").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  leadsJson: text("leads_json").notNull().default("[]"),
  totalLeads: integer("total_leads").notNull().default(0),
  dialedCount: integer("dialed_count").notNull().default(0),
  answeredCount: integer("answered_count").notNull().default(0),
  convertedCount: integer("converted_count").notNull().default(0),
  scheduleJson: text("schedule_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PabloOutboundCampaign = typeof pabloOutboundCampaignsTable.$inferSelect;
export type InsertPabloOutboundCampaign = typeof pabloOutboundCampaignsTable.$inferInsert;
