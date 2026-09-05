import { pgTable, serial, varchar, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ALPHA_ROLES = ["alpha_tester", "alpha_dev"] as const;
export type AlphaRole = (typeof ALPHA_ROLES)[number];

export const ALPHA_STATUSES = ["pending", "approved", "rejected", "revoked"] as const;
export type AlphaStatus = (typeof ALPHA_STATUSES)[number];

export const alphaApplicationsTable = pgTable("alpha_applications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  reason: text("reason").notNull().default(""),
  experience: text("experience").notNull().default(""),
  decidedByUserId: varchar("decided_by_user_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("alpha_apps_user_idx").on(table.userId),
  index("alpha_apps_status_idx").on(table.status),
  uniqueIndex("alpha_apps_user_role_active_uq").on(table.userId, table.role),
]);

export const insertAlphaApplicationSchema = createInsertSchema(alphaApplicationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlphaApplication = z.infer<typeof insertAlphaApplicationSchema>;
export type AlphaApplication = typeof alphaApplicationsTable.$inferSelect;
