import { db, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isOwnerEmail } from "./plan";

const PLATFORM_TWILIO_ORG_IDS = new Set([1, 2]);

export async function canUsePlatformTwilio(userId: string, email?: string | null): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  const memberships = await db.select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(eq(orgMembersTable.userId, userId));
  return memberships.some((membership) => PLATFORM_TWILIO_ORG_IDS.has(membership.orgId));
}