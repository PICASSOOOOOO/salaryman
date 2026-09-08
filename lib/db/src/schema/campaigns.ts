import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Email Campaigns ────────────────────────────────────────────────────────────

export const emailCampaignsTable = pgTable(
  "email_campaigns",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    subject: varchar("subject", { length: 512 }).notNull().default(""),
    previewText: varchar("preview_text", { length: 256 }).notNull().default(""),
    htmlBody: text("html_body").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    fromName: varchar("from_name", { length: 128 }).notNull().default(""),
    replyTo: varchar("reply_to", { length: 256 }).notNull().default(""),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientFilter: jsonb("recipient_filter").default({}),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalSent: integer("total_sent").notNull().default(0),
    totalOpened: integer("total_opened").notNull().default(0),
    totalClicked: integer("total_clicked").notNull().default(0),
    totalBounced: integer("total_bounced").notNull().default(0),
    totalUnsubscribed: integer("total_unsubscribed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_campaigns_user_id_idx").on(table.userId),
    index("email_campaigns_status_idx").on(table.status),
  ]
);

export const insertEmailCampaignSchema = createInsertSchema(emailCampaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;

// ── Email Campaign Recipients ──────────────────────────────────────────────────

export const emailCampaignRecipientsTable = pgTable(
  "email_campaign_recipients",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => emailCampaignsTable.id, { onDelete: "cascade" }),
    contactId: integer("contact_id"),
    email: varchar("email", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull().default(""),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    resendMessageId: varchar("resend_message_id", { length: 256 }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_campaign_recipients_campaign_id_idx").on(table.campaignId),
    index("email_campaign_recipients_email_idx").on(table.email),
  ]
);

export type EmailCampaignRecipient = typeof emailCampaignRecipientsTable.$inferSelect;

// ── SMS Campaigns ──────────────────────────────────────────────────────────────

export const smsCampaignsTable = pgTable(
  "sms_campaigns",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    messageBody: text("message_body").notNull().default(""),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipientFilter: jsonb("recipient_filter").default({}),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalSent: integer("total_sent").notNull().default(0),
    totalDelivered: integer("total_delivered").notNull().default(0),
    totalFailed: integer("total_failed").notNull().default(0),
    totalReplied: integer("total_replied").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_campaigns_user_id_idx").on(table.userId),
    index("sms_campaigns_status_idx").on(table.status),
  ]
);

export const insertSmsCampaignSchema = createInsertSchema(smsCampaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsCampaign = z.infer<typeof insertSmsCampaignSchema>;
export type SmsCampaign = typeof smsCampaignsTable.$inferSelect;

// ── SMS Campaign Recipients ────────────────────────────────────────────────────

export const smsCampaignRecipientsTable = pgTable(
  "sms_campaign_recipients",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => smsCampaignsTable.id, { onDelete: "cascade" }),
    contactId: integer("contact_id"),
    phone: varchar("phone", { length: 32 }).notNull(),
    name: varchar("name", { length: 256 }).notNull().default(""),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    twilioMessageSid: varchar("twilio_message_sid", { length: 64 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_campaign_recipients_campaign_id_idx").on(table.campaignId),
    index("sms_campaign_recipients_phone_idx").on(table.phone),
  ]
);

export type SmsCampaignRecipient = typeof smsCampaignRecipientsTable.$inferSelect;

// ── SMS Conversations (Direct SMS) ─────────────────────────────────────────────

export const smsConversationsTable = pgTable(
  "sms_conversations",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    contactId: integer("contact_id"),
    contactPhone: varchar("contact_phone", { length: 32 }).notNull(),
    contactName: varchar("contact_name", { length: 256 }).notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_conversations_user_id_idx").on(table.userId),
    index("sms_conversations_phone_idx").on(table.contactPhone),
  ]
);

export type SmsConversation = typeof smsConversationsTable.$inferSelect;

// ── SMS Messages ───────────────────────────────────────────────────────────────

export const smsMessagesTable = pgTable(
  "sms_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => smsConversationsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 256 }).notNull(),
    direction: varchar("direction", { length: 8 }).notNull(),
    body: text("body").notNull(),
    fromPhone: varchar("from_phone", { length: 32 }).notNull(),
    toPhone: varchar("to_phone", { length: 32 }).notNull(),
    twilioMessageSid: varchar("twilio_message_sid", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("sent"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_messages_conversation_id_idx").on(table.conversationId),
    index("sms_messages_user_id_idx").on(table.userId),
    index("sms_messages_twilio_sid_idx").on(table.twilioMessageSid),
    uniqueIndex("sms_messages_twilio_sid_unique").on(table.twilioMessageSid),
  ]
);

export type SmsMessage = typeof smsMessagesTable.$inferSelect;

// ── Contact Channel Preferences ────────────────────────────────────────────────

export const contactChannelPrefsTable = pgTable(
  "contact_channel_prefs",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id").notNull(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    emailOptIn: boolean("email_opt_in").notNull().default(true),
    smsOptIn: boolean("sms_opt_in").notNull().default(true),
    emailOptedOutAt: timestamp("email_opted_out_at", { withTimezone: true }),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contact_channel_prefs_contact_id_idx").on(table.contactId),
    index("contact_channel_prefs_user_id_idx").on(table.userId),
  ]
);

export type ContactChannelPref = typeof contactChannelPrefsTable.$inferSelect;
