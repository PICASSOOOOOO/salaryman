import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const ORG_TIME_OFF_TYPES = ["vacation", "personal", "other"] as const;
export const ORG_TIME_OFF_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;

export const orgTimeOffRequestsTable = pgTable("org_time_off_requests", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull(),
  requesterUserId: varchar("requester_user_id", { length: 255 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  leaveType: varchar("leave_type", { length: 30 }).notNull().default("vacation"),
  note: text("note").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewerUserId: varchar("reviewer_user_id", { length: 255 }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  foreignKey({
    name: "org_time_off_requests_org_id_fkey",
    columns: [table.orgId],
    foreignColumns: [organizationsTable.id],
  }).onDelete("cascade"),
  check("org_time_off_date_range_check", sql`${table.endDate} >= ${table.startDate}`),
  check("org_time_off_type_check", sql`${table.leaveType} IN ('vacation', 'personal', 'other')`),
  check("org_time_off_status_check", sql`${table.status} IN ('pending', 'approved', 'declined', 'cancelled')`),
  index("org_time_off_org_status_created_idx").on(table.orgId, table.status, table.createdAt),
  index("org_time_off_org_requester_created_idx").on(table.orgId, table.requesterUserId, table.createdAt),
]);

export const insertOrgTimeOffRequestSchema = createInsertSchema(orgTimeOffRequestsTable)
  .omit({ id: true, createdAt: true, updatedAt: true, reviewedAt: true, reviewerUserId: true });
export type InsertOrgTimeOffRequest = z.infer<typeof insertOrgTimeOffRequestSchema>;
export type OrgTimeOffRequest = typeof orgTimeOffRequestsTable.$inferSelect;
