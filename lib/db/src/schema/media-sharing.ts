import { pgTable, serial, varchar, integer, timestamp, text, boolean } from "drizzle-orm/pg-core";

export const sharedMediaTable = pgTable("shared_media", {
  id: serial("id").primaryKey(),
  fromUserId: varchar("from_user_id", { length: 256 }).notNull(),
  toUserId: varchar("to_user_id", { length: 256 }).notNull(),
  orgId: integer("org_id"),
  mediaType: varchar("media_type", { length: 32 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  sourceUrl: varchar("source_url", { length: 1024 }),
  objectPath: varchar("object_path", { length: 512 }),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: varchar("mime_type", { length: 128 }),
  callHistoryId: integer("call_history_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedMedia = typeof sharedMediaTable.$inferSelect;
export type InsertSharedMedia = typeof sharedMediaTable.$inferInsert;

export const screenSessionsTable = pgTable("screen_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  orgId: integer("org_id").notNull(),
  monitoredByUserId: varchar("monitored_by_user_id", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lastScreenshotAt: timestamp("last_screenshot_at", { withTimezone: true }),
  lastScreenshotUrl: varchar("last_screenshot_url", { length: 1024 }),
  screenshotCount: integer("screenshot_count").notNull().default(0),
  recordingUrl: varchar("recording_url", { length: 1024 }),
  durationSeconds: integer("duration_seconds").default(0),
  notes: text("notes"),
});

export type ScreenSession = typeof screenSessionsTable.$inferSelect;
export type InsertScreenSession = typeof screenSessionsTable.$inferInsert;
