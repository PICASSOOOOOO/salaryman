import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  db,
  organizationsTable,
  orgConnectorActivityTable,
  orgConnectorAppsTable,
  orgConnectorConnectionsTable,
  ORG_CONNECTOR_SCOPES,
} from "@workspace/db";
import { requireFeature } from "../middlewares/requirePro";
import { resolveCurrentOrgId } from "../lib/org-permissions";
import {
  createOrgConnectorToken,
  hashOrgConnectorToken,
  ORG_CONNECTOR_SCOPE_LABELS,
  parseOrgConnectorScopes,
} from "../lib/org-connectors";

const router = Router();
router.use("/platform/connectors", requireFeature("claw_bot"));

function requireSession(req: Request, res: Response): string | null {
  const userId = req.isAuthenticated?.() ? req.user?.id : null;
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return String(userId);
}

async function currentOrgId(userId: string): Promise<number | null> {
  return resolveCurrentOrgId(userId);
}

async function isOrganizationOwner(userId: string, orgId: number): Promise<boolean> {
  const [org] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  return org?.ownerUserId === userId;
}

function publicApp(app: typeof orgConnectorAppsTable.$inferSelect) {
  return {
    id: app.id,
    clientId: app.clientId,
    name: app.name,
    description: app.description,
    requestedScopes: app.requestedScopes,
    active: app.active,
    createdAt: app.createdAt,
  };
}

async function writeActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  details: {
    orgId: number;
    connectionId: number;
    appId: number;
    actorUserId?: string | null;
    eventType: string;
    resourceType?: string | null;
    summary: string;
  },
): Promise<void> {
  await tx.insert(orgConnectorActivityTable).values(details);
}

router.get("/platform/connectors/scopes", (_req, res) => {
  res.json(ORG_CONNECTOR_SCOPES.map((scope) => ({
    id: scope,
    label: ORG_CONNECTOR_SCOPE_LABELS[scope],
  })));
});

router.get("/platform/connectors/apps/mine", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const apps = await db.select().from(orgConnectorAppsTable)
    .where(eq(orgConnectorAppsTable.ownerUserId, userId))
    .orderBy(desc(orgConnectorAppsTable.createdAt));
  res.json({ apps: apps.map(publicApp) });
});

router.post("/platform/connectors/apps", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const requestedScopes = parseOrgConnectorScopes(req.body?.requestedScopes);
  if (!name || name.length > 120 || description.length > 500 || !requestedScopes?.length) {
    res.status(400).json({ error: "Provide an app name, description under 500 characters, and at least one valid scope." });
    return;
  }
  const clientId = `sma_${cryptoRandomId()}`;
  const [app] = await db.insert(orgConnectorAppsTable).values({
    ownerUserId: userId,
    clientId,
    name,
    description,
    requestedScopes,
  }).returning();
  res.status(201).json({ app: publicApp(app) });
});

router.get("/platform/connectors/apps/:clientId", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const [app] = await db.select().from(orgConnectorAppsTable)
    .where(and(
      eq(orgConnectorAppsTable.clientId, req.params.clientId),
      eq(orgConnectorAppsTable.active, true),
    ))
    .limit(1);
  if (!app) {
    res.status(404).json({ error: "Active connector app not found" });
    return;
  }
  res.json({ app: publicApp(app) });
});

router.get("/platform/connectors/organization", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const orgId = await currentOrgId(userId);
  if (!orgId) {
    res.status(404).json({ error: "No active organization" });
    return;
  }
  const connections = await db.select({
    id: orgConnectorConnectionsTable.id,
    appId: orgConnectorConnectionsTable.appId,
    grantedScopes: orgConnectorConnectionsTable.grantedScopes,
    status: orgConnectorConnectionsTable.status,
    tokenPrefix: orgConnectorConnectionsTable.tokenPrefix,
    connectedByUserId: orgConnectorConnectionsTable.connectedByUserId,
    createdAt: orgConnectorConnectionsTable.createdAt,
    lastActivityAt: orgConnectorConnectionsTable.lastActivityAt,
    revokedAt: orgConnectorConnectionsTable.revokedAt,
    clientId: orgConnectorAppsTable.clientId,
    appName: orgConnectorAppsTable.name,
    appDescription: orgConnectorAppsTable.description,
    appActive: orgConnectorAppsTable.active,
  }).from(orgConnectorConnectionsTable)
    .innerJoin(orgConnectorAppsTable, eq(orgConnectorAppsTable.id, orgConnectorConnectionsTable.appId))
    .where(eq(orgConnectorConnectionsTable.orgId, orgId))
    .orderBy(desc(orgConnectorConnectionsTable.createdAt));
  const connectionIds = connections.map((connection) => connection.id);
  const activity = connectionIds.length
    ? await db.select().from(orgConnectorActivityTable)
      .where(and(
        eq(orgConnectorActivityTable.orgId, orgId),
        inArray(orgConnectorActivityTable.connectionId, connectionIds),
      ))
      .orderBy(desc(orgConnectorActivityTable.createdAt))
      .limit(50)
    : [];
  res.json({
    orgId,
    canManage: await isOrganizationOwner(userId, orgId),
    connections,
    activity: activity.map(({ id, connectionId, eventType, resourceType, summary, createdAt }) => ({
      id, connectionId, eventType, resourceType, summary, createdAt,
    })),
  });
});

router.post("/platform/connectors/apps/:clientId/connect", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const orgId = await currentOrgId(userId);
  if (!orgId || !(await isOrganizationOwner(userId, orgId))) {
    res.status(403).json({ error: "Only the organization owner can approve a connector." });
    return;
  }
  const [app] = await db.select().from(orgConnectorAppsTable)
    .where(and(
      eq(orgConnectorAppsTable.clientId, req.params.clientId),
      eq(orgConnectorAppsTable.active, true),
    ))
    .limit(1);
  if (!app) {
    res.status(404).json({ error: "Active connector app not found" });
    return;
  }
  const scopes = parseOrgConnectorScopes(req.body?.scopes);
  if (!scopes?.length || scopes.some((scope) => !app.requestedScopes.includes(scope))) {
    res.status(400).json({ error: "Choose one or more scopes requested by this app." });
    return;
  }

  const token = createOrgConnectorToken();
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(orgConnectorConnectionsTable)
      .where(and(
        eq(orgConnectorConnectionsTable.orgId, orgId),
        eq(orgConnectorConnectionsTable.appId, app.id),
      ))
      .for("update")
      .limit(1);
    let connectionId: number;
    let eventType: string;
    if (existing) {
      if (existing.status === "connected") {
        return { error: "This app is already connected. Rotate its token to replace the current credential." } as const;
      }
      const [updated] = await tx.update(orgConnectorConnectionsTable).set({
        grantedScopes: scopes,
        status: "connected",
        tokenHash: hashOrgConnectorToken(token),
        tokenPrefix: token.slice(0, 16),
        connectedByUserId: userId,
        createdAt: now,
        revokedAt: null,
      }).where(eq(orgConnectorConnectionsTable.id, existing.id)).returning({ id: orgConnectorConnectionsTable.id });
      connectionId = updated.id;
      eventType = "connection_reenabled";
    } else {
      const [created] = await tx.insert(orgConnectorConnectionsTable).values({
        orgId,
        appId: app.id,
        grantedScopes: scopes,
        status: "connected",
        tokenHash: hashOrgConnectorToken(token),
        tokenPrefix: token.slice(0, 16),
        connectedByUserId: userId,
      }).returning({ id: orgConnectorConnectionsTable.id });
      connectionId = created.id;
      eventType = "connection_approved";
    }
    await writeActivity(tx, {
      orgId,
      connectionId,
      appId: app.id,
      actorUserId: userId,
      eventType,
      summary: `${app.name} approved with ${scopes.length} scope${scopes.length === 1 ? "" : "s"}.`,
    });
    return { connectionId } as const;
  });
  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.status(201).json({
    connectionId: result.connectionId,
    appName: app.name,
    grantedScopes: scopes,
    accessToken: token,
    message: "Copy this token into the app owner's connector settings. It will not be shown again.",
  });
});

router.post("/platform/connectors/connections/:id/rotate", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const orgId = await currentOrgId(userId);
  const connectionId = Number(req.params.id);
  if (!orgId || !Number.isSafeInteger(connectionId) || connectionId <= 0
    || !(await isOrganizationOwner(userId, orgId))) {
    res.status(403).json({ error: "Only the organization owner can rotate connector tokens." });
    return;
  }
  const token = createOrgConnectorToken();
  const rotated = await db.transaction(async (tx) => {
    const [connection] = await tx.select().from(orgConnectorConnectionsTable)
      .where(and(
        eq(orgConnectorConnectionsTable.id, connectionId),
        eq(orgConnectorConnectionsTable.orgId, orgId),
        eq(orgConnectorConnectionsTable.status, "connected"),
      ))
      .for("update")
      .limit(1);
    if (!connection) return null;
    const [app] = await tx.select({ name: orgConnectorAppsTable.name })
      .from(orgConnectorAppsTable).where(eq(orgConnectorAppsTable.id, connection.appId)).limit(1);
    await tx.update(orgConnectorConnectionsTable).set({
      tokenHash: hashOrgConnectorToken(token),
      tokenPrefix: token.slice(0, 16),
    }).where(eq(orgConnectorConnectionsTable.id, connection.id));
    await writeActivity(tx, {
      orgId,
      connectionId,
      appId: connection.appId,
      actorUserId: userId,
      eventType: "token_rotated",
      summary: `${app?.name ?? "Connector"} access token rotated.`,
    });
    return { appName: app?.name ?? "Connector" };
  });
  if (!rotated) {
    res.status(404).json({ error: "Connected app not found" });
    return;
  }
  res.json({
    ...rotated,
    accessToken: token,
    message: "Copy this token into the app owner's connector settings. It will not be shown again.",
  });
});

router.post("/platform/connectors/connections/:id/revoke", async (req, res) => {
  const userId = requireSession(req, res);
  if (!userId) return;
  const orgId = await currentOrgId(userId);
  const connectionId = Number(req.params.id);
  if (!orgId || !Number.isSafeInteger(connectionId) || connectionId <= 0
    || !(await isOrganizationOwner(userId, orgId))) {
    res.status(403).json({ error: "Only the organization owner can revoke a connector." });
    return;
  }
  const revoked = await db.transaction(async (tx) => {
    const [connection] = await tx.select().from(orgConnectorConnectionsTable)
      .where(and(
        eq(orgConnectorConnectionsTable.id, connectionId),
        eq(orgConnectorConnectionsTable.orgId, orgId),
        eq(orgConnectorConnectionsTable.status, "connected"),
      ))
      .for("update")
      .limit(1);
    if (!connection) return false;
    const [app] = await tx.select({ name: orgConnectorAppsTable.name })
      .from(orgConnectorAppsTable).where(eq(orgConnectorAppsTable.id, connection.appId)).limit(1);
    await tx.update(orgConnectorConnectionsTable).set({
      status: "revoked",
      tokenHash: null,
      tokenPrefix: null,
      revokedAt: new Date(),
    }).where(eq(orgConnectorConnectionsTable.id, connectionId));
    await writeActivity(tx, {
      orgId,
      connectionId,
      appId: connection.appId,
      actorUserId: userId,
      eventType: "connection_revoked",
      summary: `${app?.name ?? "Connector"} access revoked.`,
    });
    return true;
  });
  if (!revoked) {
    res.status(404).json({ error: "Connected app not found" });
    return;
  }
  res.json({ success: true });
});

router.get("/connectors/v1/whoami", async (req, res) => {
  const authorization = req.get("authorization") ?? "";
  const match = authorization.match(/^Bearer (sma_live_[a-f0-9]{64})$/);
  if (!match) {
    res.status(401).json({ error: "Valid connector bearer token required" });
    return;
  }
  const tokenHash = hashOrgConnectorToken(match[1]);
  const identity = await db.transaction(async (tx) => {
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
      .where(eq(orgConnectorConnectionsTable.id, row.connectionId));
    if (!row.lastActivityAt || now.getTime() - row.lastActivityAt.getTime() >= 15 * 60 * 1000) {
      await writeActivity(tx, {
        orgId: row.orgId,
        connectionId: row.connectionId,
        appId: row.appId,
        eventType: "api_authenticated",
        resourceType: "connector",
        summary: `${row.appName} authenticated with SALARYMAN.`,
      });
    }
    return row;
  });
  if (!identity) {
    res.status(401).json({ error: "Connector token is invalid or revoked" });
    return;
  }
  res.json({
    organizationId: identity.orgId,
    appName: identity.appName,
    scopes: identity.scopes,
    status: "connected",
  });
});

function cryptoRandomId(): string {
  return randomBytes(18).toString("hex");
}

export default router;
