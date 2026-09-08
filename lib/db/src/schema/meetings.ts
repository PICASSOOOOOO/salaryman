import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  roomCode: varchar("room_code", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull(),
  hostUserId: varchar("host_user_id").notNull(),
  hostName: varchar("host_name", { length: 100 }).notNull().default(""),
  maxGuests: integer("max_guests").notNull().default(6),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appointmentId: integer("appointment_id"),
}, (table) => [
  index("meetings_room_code_idx").on(table.roomCode),
  index("meetings_host_user_id_idx").on(table.hostUserId),
  index("meetings_expires_at_idx").on(table.expiresAt),
]);

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
