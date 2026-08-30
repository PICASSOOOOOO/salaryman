import { pgTable, serial, varchar, text, timestamp, integer, boolean, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { organizationsTable } from "./organizations";

export const CHAT_CHANNEL_TYPES = ["global", "private", "company", "pablo"] as const;
export type ChatChannelType = (typeof CHAT_CHANNEL_TYPES)[number];

export const chatChannelsTable = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  name: varchar("name", { length: 120 }),
  orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  user1Id: varchar("user1_id").references(() => usersTable.id, { onDelete: "cascade" }),
  user2Id: varchar("user2_id").references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("chat_channels_type_idx").on(t.type),
  index("chat_channels_org_id_idx").on(t.orgId),
  index("chat_channels_user1_idx").on(t.user1Id),
  index("chat_channels_user2_idx").on(t.user2Id),
]);

export const insertChatChannelSchema = createInsertSchema(chatChannelsTable).omit({ id: true, createdAt: true });
export type InsertChatChannel = z.infer<typeof insertChatChannelSchema>;
export type ChatChannel = typeof chatChannelsTable.$inferSelect;

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => chatChannelsTable.id, { onDelete: "cascade" }),
  senderUserId: varchar("sender_user_id"),
  senderName: varchar("sender_name", { length: 200 }),
  senderUsername: varchar("sender_username", { length: 32 }),
  // City/realm the sender was in when they sent this message, so chat (which is
  // cross-city) can show a "location" badge per message. Null for bots/system.
  senderCity: varchar("sender_city", { length: 40 }),
  isBot: boolean("is_bot").notNull().default(false),
  content: text("content").notNull(),
  // Optional reference to a media-library file (filesFoldersTable). When set,
  // the message carries an attachment the recipient can open/download.
  attachmentObjectPath: varchar("attachment_object_path", { length: 512 }),
  attachmentName: varchar("attachment_name", { length: 256 }),
  attachmentMimeType: varchar("attachment_mime_type", { length: 128 }),
  attachmentSizeBytes: integer("attachment_size_bytes"),
  attachmentFileId: integer("attachment_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("chat_messages_channel_id_idx").on(t.channelId),
  index("chat_messages_sender_idx").on(t.senderUserId),
  index("chat_messages_created_at_idx").on(t.createdAt),
]);

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;

export const chatReadCursorsTable = pgTable("chat_read_cursors", {
  channelId: integer("channel_id").notNull().references(() => chatChannelsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lastReadMessageId: integer("last_read_message_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("chat_read_cursors_user_channel_unique").on(t.userId, t.channelId),
  index("chat_read_cursors_user_idx").on(t.userId),
  index("chat_read_cursors_channel_idx").on(t.channelId),
]);

export const insertChatReadCursorSchema = createInsertSchema(chatReadCursorsTable);
export type ChatReadCursor = typeof chatReadCursorsTable.$inferSelect;
