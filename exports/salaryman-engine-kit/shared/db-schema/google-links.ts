import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userGoogleLinksTable = pgTable("user_google_links", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  scope: text("scope"),
  googleEmail: varchar("google_email", { length: 320 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("user_google_links_email_idx").on(t.googleEmail),
]);

export type UserGoogleLink = typeof userGoogleLinksTable.$inferSelect;
