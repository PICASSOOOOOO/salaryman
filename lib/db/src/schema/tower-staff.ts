import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const towerStaffAssignmentsTable = pgTable("tower_staff_assignments", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 24 }).notNull(),
  careerLevel: integer("career_level").notNull().default(1),
  assignedByUserId: varchar("assigned_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check(
    "tower_staff_assignments_role_check",
    sql`${table.role} in ('operations', 'maintenance', 'security')`,
  ),
  check("tower_staff_assignments_career_level_check", sql`${table.careerLevel} between 1 and 10`),
]);

export type TowerStaffAssignment = typeof towerStaffAssignmentsTable.$inferSelect;
