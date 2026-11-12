import { pgTable, serial, varchar, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull().default(""),
  location: varchar("location", { length: 300 }).notNull().default(""),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  reminderMinutes: integer("reminder_minutes").notNull().default(15),
  googleEventId: varchar("google_event_id", { length: 300 }),
  googleCalendarSynced: boolean("google_calendar_synced").notNull().default(false),
  reminderEmailSent: boolean("reminder_email_sent").notNull().default(false),
  meetingRoomCode: varchar("meeting_room_code", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("appointments_user_id_idx").on(table.userId),
  index("appointments_start_at_idx").on(table.startAt),
  index("appointments_google_event_id_idx").on(table.googleEventId),
]);

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
