import { alphaApplicationsTable, db, orgMembersTable, organizationsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isOwnerEmail } from "./plan";

const PLATFORM_TWILIO_ORG_IDS = new Set([1, 2]);
const PICASSO_ADMIN_ROLES = ["owner", "ceo", "executive", "director"] as const;

export async function canUsePlatformTwilio(userId: string, email?: string | null): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  const [approvedModerator] = await db.select({ id: alphaApplicationsTable.id })
    .from(alphaApplicationsTable)
    .where(and(
      eq(alphaApplicationsTable.userId, userId),
      eq(alphaApplicationsTable.role, "alpha_tester"),
      eq(alphaApplicationsTable.status, "approved"),
    ))
    .limit(1);
  if (approvedModerator) return true;

  // Picasso staff authorization follows the actual org identity, not a
  // hard-coded serial ID that can differ between environments.
  const [picassoAdmin] = await db.select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .innerJoin(organizationsTable, and(
      eq(orgMembersTable.orgId, organizationsTable.id),
      eq(organizationsTable.isDeveloper, true),
      sql`lower(${organizationsTable.name}) = 'picasso'`,
    ))
    .where(and(
      eq(orgMembersTable.userId, userId),
      eq(orgMembersTable.status, "active"),
      inArray(orgMembersTable.role, [...PICASSO_ADMIN_ROLES]),
    ))
    .limit(1);
  if (picassoAdmin) return true;

  const memberships = await db.select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  return memberships.some((membership) => PLATFORM_TWILIO_ORG_IDS.has(membership.orgId));
}