import { index, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const towerShopStaffAssignmentsTable = pgTable(
  "tower_shop_staff_assignments",
  {
    businessKey: varchar("business_key", { length: 80 }).notNull(),
    userId: varchar("user_id", { length: 256 }).notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assignedByUserId: varchar("assigned_by_user_id", { length: 256 })
      .references(() => usersTable.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "tower_shop_staff_assignments_business_user_pk",
      columns: [table.businessKey, table.userId],
    }),
    index("tower_shop_staff_assignments_user_idx").on(table.userId),
  ],
);

export const insertTowerShopStaffAssignmentSchema = createInsertSchema(towerShopStaffAssignmentsTable)
  .omit({ assignedAt: true });
export type InsertTowerShopStaffAssignment = z.infer<typeof insertTowerShopStaffAssignmentSchema>;
export type TowerShopStaffAssignment = typeof towerShopStaffAssignmentsTable.$inferSelect;
