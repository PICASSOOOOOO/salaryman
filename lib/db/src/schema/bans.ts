import { pgTable, serial, varchar, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const bansTable = pgTable("bans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  reason: text("reason").notNull(),
  bannedBy: varchar("banned_by").notNull().references(() => usersTable.id),
  type: varchar("type", { length: 20 }).notNull().default("temporary"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("bans_user_id_idx").on(t.userId),
  index("bans_active_idx").on(t.active),
]);

export type Ban = typeof bansTable.$inferSelect;
export type InsertBan = typeof bansTable.$inferInsert;
