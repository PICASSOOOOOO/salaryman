import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const systemConfigTable = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value").notNull().default(""),
  category: varchar("category", { length: 100 }).notNull().default("general"),
  description: text("description").notNull().default(""),
  updatedBy: varchar("updated_by", { length: 255 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastMessagesTable = pgTable("broadcast_messages", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("info"),
  active: boolean("active").notNull().default(true),
  targetAudience: varchar("target_audience", { length: 50 }).notNull().default("all"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: varchar("target_id", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
