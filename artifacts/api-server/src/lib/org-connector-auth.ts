import { and, eq } from "drizzle-orm";
import {
  db,
  orgConnectorActivityTable,
  orgConnectorAppsTable,
  orgConnectorConnectionsTable,
  type OrgConnectorScope,
} from "@workspace/db";
import { hashOrgConnectorToken } from "./org-connectors";

export type OrgConnectorPrincipal = {
  connectionId: number;
  orgId: number;
  appId: number;
  appName: string;
  scopes: OrgConnectorScope[];
};

export function parseOrgConnectorBearer(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer (sma_live_[a-f0-9]{64})$/);
  return match?.[1] ?? null;
}

export async function authenticateOrgConnectorToken(token: string): Promise<OrgConnectorPrincipal | null> {
  const tokenHash = hashOrgConnectorToken(token);
  return db.transaction(async (tx) => {
    const [row] = await tx.select({
      connectionId: orgConnectorConnectionsTable.id,
      orgId: orgConnectorConnectionsTable.orgId,
      appId: orgConnectorAppsTable.id,
      appName: orgConnectorAppsTable.name,
      appActive: orgConnectorAppsTable.active,
      scopes: orgConnectorConnectionsTable.grantedScopes,
      status: orgConnectorConnectionsTable.status,
      lastActivityAt: orgConnectorConnectionsTable.lastActivityAt,
    }).from(orgConnectorConnectionsTable)
      .innerJoin(orgConnectorAppsTable, eq(orgConnectorAppsTable.id, orgConnectorConnectionsTable.appId))
      .where(eq(orgConnectorConnectionsTable.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.status !== "connected" || !row.appActive) return null;

    const now = new Date();
    await tx.update(orgConnectorConnectionsTable).set({ lastActivityAt: now })
      .where(and(
        eq(orgConnectorConnectionsTable.id, row.connectionId),
        eq(orgConnectorConnectionsTable.status, "connected"),
      ));
    if (!row.lastActivityAt || now.getTime() - row.lastActivityAt.getTime() >= 15 * 60 * 1000) {
      await tx.insert(orgConnectorActivityTable).values({
        orgId: row.orgId,
        connectionId: row.connectionId,
        appId: row.appId,
        eventType: "api_authenticated",
        resourceType: "connector",
        summary: `${row.appName} authenticated with SALARYMAN.`,
      });
    }
    return {
      connectionId: row.connectionId,
      orgId: row.orgId,
      appId: row.appId,
      appName: row.appName,
      scopes: row.scopes,
    };
  });
}
