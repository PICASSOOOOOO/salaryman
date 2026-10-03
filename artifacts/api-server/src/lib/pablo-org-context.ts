import { and, eq } from "drizzle-orm";
import {
  db,
  orgMembersTable,
  organizationsTable,
} from "@workspace/db";
import { resolveCurrentOrgId } from "./org-permissions";

export interface PabloOrgContext {
  id: number;
  name: string;
  industry: string | null;
}

/**
 * Resolve Pablo's business context from the member's current organization.
 * Explicit org IDs are used only by server routes that already resolved the
 * owning organization (for example, an inbound SMS to an org-owned number).
 */
export async function resolvePabloOrgContext(
  userId: string,
  organizationId?: number | null,
): Promise<PabloOrgContext | null> {
  let orgId: number | null;
  if (organizationId !== undefined && organizationId !== null) {
    if (!Number.isInteger(organizationId) || organizationId <= 0) return null;
    orgId = organizationId;
  } else {
    orgId = await resolveCurrentOrgId(userId);
  }
  if (!orgId) return null;

  const [organization] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      industry: organizationsTable.industry,
      ownerUserId: organizationsTable.ownerUserId,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!organization) return null;

  if (organizationId != null && organization.ownerUserId !== userId) {
    const [membership] = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.orgId, orgId),
        eq(orgMembersTable.userId, userId),
        eq(orgMembersTable.status, "active"),
      ))
      .limit(1);
    if (!membership) return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    industry: organization.industry,
  };
}