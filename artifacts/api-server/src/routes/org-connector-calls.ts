import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  crmActivitiesTable,
  leadRecordsTable,
  type OrgConnectorScope,
} from "@workspace/db";
import {
  authenticateOrgConnectorToken,
  parseOrgConnectorBearer,
} from "../lib/org-connector-auth";
import { hasOrgConnectorScope } from "../lib/org-connectors";

const router = Router();
const CALL_CHANNELS = ["call", "voicemail"] as const;
const PUBLIC_CALL_FIELDS = {
  id: crmActivitiesTable.id,
  leadId: crmActivitiesTable.leadId,
  channel: crmActivitiesTable.channel,
  direction: crmActivitiesTable.direction,
  status: crmActivitiesTable.status,
  durationSeconds: crmActivitiesTable.durationSeconds,
  occurredAt: crmActivitiesTable.occurredAt,
};

type ConnectorPrincipal = NonNullable<Awaited<ReturnType<typeof authenticateOrgConnectorToken>>>;

async function requireScope(
  req: Request,
  res: Response,
  scope: OrgConnectorScope,
): Promise<ConnectorPrincipal | null> {
  const token = parseOrgConnectorBearer(req.get("authorization"));
  if (!token) {
    res.status(401).json({ error: "Valid connector bearer token required" });
    return null;
  }
  const principal = await authenticateOrgConnectorToken(token);
  if (!principal) {
    res.status(401).json({ error: "Connector token is invalid or revoked" });
    return null;
  }
  if (!hasOrgConnectorScope(principal.scopes, scope)) {
    res.status(403).json({ error: `The organization has not granted ${scope}.` });
    return null;
  }
  return principal;
}

function queryInteger(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

router.get("/connectors/v1/calls", async (req, res) => {
  const principal = await requireScope(req, res, "calls:read");
  if (!principal) return;

  const { leadId: rawLeadId, channel: rawChannel, direction: rawDirection } =
    req.query as Record<string, unknown>;
  let leadId: number | undefined;
  if (rawLeadId !== undefined) {
    if (typeof rawLeadId !== "string" || !/^[1-9]\d*$/.test(rawLeadId)) {
      res.status(400).json({ error: "leadId must be a positive integer" });
      return;
    }
    leadId = Number(rawLeadId);
    if (!Number.isSafeInteger(leadId)) {
      res.status(400).json({ error: "leadId must be a positive integer" });
      return;
    }
    const [lead] = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable)
      .where(and(
        eq(leadRecordsTable.id, leadId),
        eq(leadRecordsTable.orgId, principal.orgId),
      ))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
  }

  let channel: typeof CALL_CHANNELS[number] | undefined;
  if (rawChannel !== undefined) {
    if (typeof rawChannel !== "string" || !CALL_CHANNELS.includes(rawChannel as typeof CALL_CHANNELS[number])) {
      res.status(400).json({ error: "channel must be call or voicemail" });
      return;
    }
    channel = rawChannel as typeof CALL_CHANNELS[number];
  }

  let direction: "inbound" | "outbound" | undefined;
  if (rawDirection !== undefined) {
    if (rawDirection !== "inbound" && rawDirection !== "outbound") {
      res.status(400).json({ error: "direction must be inbound or outbound" });
      return;
    }
    direction = rawDirection;
  }

  const limit = queryInteger(req.query.limit, 100, 1, 200);
  const offset = queryInteger(req.query.offset, 0, 0, 10_000);
  if (limit === null || offset === null) {
    res.status(400).json({ error: "limit or offset is outside the allowed range" });
    return;
  }

  const conditions = [
    eq(crmActivitiesTable.orgId, principal.orgId),
    inArray(crmActivitiesTable.channel, channel ? [channel] : [...CALL_CHANNELS]),
  ];
  if (leadId !== undefined) conditions.push(eq(crmActivitiesTable.leadId, leadId));
  if (direction) conditions.push(eq(crmActivitiesTable.direction, direction));

  const activities = await db.select(PUBLIC_CALL_FIELDS).from(crmActivitiesTable)
    .where(and(...conditions))
    .orderBy(desc(crmActivitiesTable.occurredAt), desc(crmActivitiesTable.id))
    .limit(limit)
    .offset(offset);

  res.json({ activities, limit, offset });
});

export default router;
