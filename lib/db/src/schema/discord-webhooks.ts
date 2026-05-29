import { pgTable, serial, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discordWebhooksTable = pgTable("discord_webhooks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  webhookUrl: text("webhook_url").notNull().default(""),
  eventNewHire: boolean("event_new_hire").notNull().default(true),
  eventNewContact: boolean("event_new_contact").notNull().default(false),
  eventWeeklySummary: boolean("event_weekly_summary").notNull().default(false),
  eventNewApplicant: boolean("event_new_applicant").notNull().default(false),
  eventApplicantStageChanged: boolean("event_applicant_stage_changed").notNull().default(false),
  eventDealStageChanged: boolean("event_deal_stage_changed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("discord_webhooks_user_id_idx").on(table.userId),
]);

export const insertDiscordWebhookSchema = createInsertSchema(discordWebhooksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiscordWebhook = z.infer<typeof insertDiscordWebhookSchema>;
export type DiscordWebhook = typeof discordWebhooksTable.$inferSelect;
