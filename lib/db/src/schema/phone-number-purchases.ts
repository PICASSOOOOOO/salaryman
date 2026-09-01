import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

export const phoneNumberPurchasesTable = pgTable("phone_number_purchases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  stripeSessionId: varchar("stripe_session_id", { length: 256 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 32 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  label: varchar("label", { length: 64 }).notNull().default("main"),
  amountCents: integer("amount_cents").notNull().default(1000),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  twilioSid: varchar("twilio_sid", { length: 64 }),
  failureReason: varchar("failure_reason", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("phone_number_purchases_user_idx").on(table.userId),
  index("phone_number_purchases_session_idx").on(table.stripeSessionId),
  index("phone_number_purchases_number_idx").on(table.phoneNumber),
]);

export type PhoneNumberPurchase = typeof phoneNumberPurchasesTable.$inferSelect;