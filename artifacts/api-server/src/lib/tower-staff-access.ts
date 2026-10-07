import { and, eq, inArray } from "drizzle-orm";
import { db, towerStaffAssignmentsTable } from "@workspace/db";

export const TOWER_STAFF_ROLES = ["operations", "maintenance", "security"] as const;
export type TowerStaffRole = (typeof TOWER_STAFF_ROLES)[number];

export async function hasTowerStaffAssignment(userId: string): Promise<boolean> {
  const [assignment] = await db.select({ userId: towerStaffAssignmentsTable.userId })
    .from(towerStaffAssignmentsTable)
    .where(and(
      eq(towerStaffAssignmentsTable.userId, userId),
      inArray(towerStaffAssignmentsTable.role, [...TOWER_STAFF_ROLES]),
    ))
    .limit(1);
  return assignment != null;
}
