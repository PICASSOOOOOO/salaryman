import { pgTable, serial, varchar, integer, text, timestamp, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const CREDIT_APPLICATION_PRODUCTS = ["loan", "credit_line", "grant"] as const;
export const CREDIT_APPLICATION_STATUSES = ["pending", "approved", "declined", "funded", "repaid", "defaulted"] as const;

export const creditApplicationsTable = pgTable("credit_applications", {
  id: serial("id").primaryKey(),
  applicantUserId: varchar("applicant_user_id", { length: 64 }).notNull(),
  orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  scope: varchar("scope", { length: 16 }).notNull().default("individual"),
  product: varchar("product", { length: 20 }).notNull(),
  requestedFiat: integer("requested_fiat").notNull(),
  approvedFiat: integer("approved_fiat").notNull().default(0),
  aprBps: integer("apr_bps").notNull().default(1500),
  termMonths: integer("term_months").notNull().default(12),
  purpose: text("purpose").notNull().default(""),
  applicantScore: integer("applicant_score").notNull().default(0),
  orgScore: integer("org_score"),
  orgAgeDays: integer("org_age_days"),
  monthlyIncomeFiat: integer("monthly_income_fiat").notNull().default(0),
  consistencyScore: integer("consistency_score").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewerUserId: varchar("reviewer_user_id", { length: 64 }),
  reviewerNotes: text("reviewer_notes"),
  decisionAt: timestamp("decision_at", { withTimezone: true }),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("credit_applications_applicant_idx").on(t.applicantUserId, t.createdAt),
  index("credit_applications_org_idx").on(t.orgId, t.createdAt),
  index("credit_applications_status_idx").on(t.status, t.createdAt),
  uniqueIndex("credit_applications_one_pending_per_user_idx").on(t.applicantUserId).where(sql`${t.status} = 'pending'`),
]);

export const creditUsageEventsTable = pgTable("credit_usage_events", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => creditApplicationsTable.id, { onDelete: "set null" }),
  applicantUserId: varchar("applicant_user_id", { length: 64 }).notNull(),
  orgId: integer("org_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  amountFiat: integer("amount_fiat").notNull().default(0),
  metadata: json("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("credit_usage_events_applicant_idx").on(t.applicantUserId, t.createdAt),
  index("credit_usage_events_org_idx").on(t.orgId, t.createdAt),
  index("credit_usage_events_application_idx").on(t.applicationId, t.createdAt),
]);

export const insertCreditApplicationSchema = createInsertSchema(creditApplicationsTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true, approvedFiat: true,
  reviewerUserId: true, reviewerNotes: true, decisionAt: true, fundedAt: true,
});
export type CreditApplication = typeof creditApplicationsTable.$inferSelect;
export type CreditUsageEvent = typeof creditUsageEventsTable.$inferSelect;
export type InsertCreditApplication = z.infer<typeof insertCreditApplicationSchema>;