import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const blockedEmailDomainsTable = pgTable("blocked_email_domains", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  reason: varchar("reason", { length: 100 }).notNull().default("disposable"),
  addedBy: varchar("added_by", { length: 255 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const flaggedUsersTable = pgTable("flagged_users", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  email: varchar("email", { length: 255 }),
  reason: varchar("reason", { length: 100 }).notNull(),
  details: text("details"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttemptsTable = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  blocked: boolean("blocked").notNull().default(false),
  blockReason: varchar("block_reason", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
