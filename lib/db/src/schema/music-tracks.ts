import { pgTable, serial, text, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const musicTracksTable = pgTable("music_tracks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  artist: varchar("artist", { length: 256 }).notNull().default("Unknown Artist"),
  album: varchar("album", { length: 256 }),
  year: integer("year"),
  artworkUrl: text("artwork_url"),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  durationSec: integer("duration_sec").notNull().default(0),
  objectPath: text("object_path").notNull(),
  source: varchar("source", { length: 32 }).notNull().default("upload"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("music_tracks_user_idx").on(t.userId, t.position),
}));

export const insertMusicTrackSchema = createInsertSchema(musicTracksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMusicTrack = z.infer<typeof insertMusicTrackSchema>;
export type MusicTrack = typeof musicTracksTable.$inferSelect;
