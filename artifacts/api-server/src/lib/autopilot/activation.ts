import {
  db,
  autopilotConfigsTable,
  AUTOPILOT_PRIME_AUTO_START_DOMAINS,
  organizationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveCurrentOrgId } from "../org-permissions";

/**
 * Start the currently supported workflows for a newly paid Prime account.
 * Existing config rows are deliberately left alone, so a saved pause or
 * preference is not undone by a retried Stripe event.
 */
export async function autoActivatePrimeWorkflows(
  userId: string,
  options: { orgId?: number | null; companyBilled?: boolean } = {},
): Promise<number | null> {
  const hintedOrgId = options.orgId;
  const orgId = Number.isInteger(hintedOrgId) && Number(hintedOrgId) > 0
    ? Number(hintedOrgId)
    : options.companyBilled
      ? null
      : await resolveCurrentOrgId(userId);

  if (!orgId) return null;

  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org || (!options.companyBilled && org.ownerUserId !== userId)) {
    return null;
  }

  const configuredRows = await db
    .select({ domain: autopilotConfigsTable.domain })
    .from(autopilotConfigsTable)
    .where(eq(autopilotConfigsTable.orgId, orgId));
  const configured = new Set(configuredRows.map((row) => row.domain));
  const missingDomains = AUTOPILOT_PRIME_AUTO_START_DOMAINS.filter((domain) => !configured.has(domain));

  if (missingDomains.length > 0) {
    await db
      .insert(autopilotConfigsTable)
      .values(missingDomains.map((domain) => ({
        orgId,
        domain,
        enabled: true,
        updatedBy: userId,
      })))
      .onConflictDoNothing({
        target: [autopilotConfigsTable.orgId, autopilotConfigsTable.domain],
      });
  }

  return orgId;
}