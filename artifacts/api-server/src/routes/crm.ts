import { Router, type Request, type Response } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db,
  crmActivitiesTable,
  leadRecordsTable,
  orgMembersTable,
  organizationsTable,
} from "@workspace/db";

const router = Router();

function getUserId(req: Request): string | null {
  if (!req.isAuthenticated?.() || !req.user) return null;
  return (req.user as { id?: string }).id ?? null;
}

async function getCallerOrg(
  userId: string,
): Promise<{ orgId: number; role: string } | null> {
  const rows = await db
    .select()
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")));
  if (rows.length === 0) return null;
  return { orgId: rows[0].orgId, role: rows[0].role };
}

// GET /api/crm/activities — org-wide telephony feed (calls, voicemails, SMS).
// Filters: leadId, channel, phone, direction, limit. Visible to all org members.
router.get("/crm/activities", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const membership = await getCallerOrg(userId);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }

  const { leadId, channel, phone, direction } = req.query as Record<string, string>;
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "100", 10) || 100, 1), 500);

  const conditions = [eq(crmActivitiesTable.orgId, membership.orgId)];
  if (leadId && /^\d+$/.test(leadId)) conditions.push(eq(crmActivitiesTable.leadId, parseInt(leadId, 10)));
  if (channel) conditions.push(eq(crmActivitiesTable.channel, channel));
  if (direction) conditions.push(eq(crmActivitiesTable.direction, direction));
  if (phone) {
    const last10 = phone.replace(/\D/g, "").slice(-10);
    if (last10) conditions.push(sql`right(regexp_replace(${crmActivitiesTable.phone}, '\\D', '', 'g'), 10) = ${last10}`);
  }

  const activities = await db
    .select()
    .from(crmActivitiesTable)
    .where(and(...conditions))
    .orderBy(desc(crmActivitiesTable.occurredAt))
    .limit(limit);

  res.json({ activities, orgId: membership.orgId });
});

// GET /api/crm/leads/:id/timeline — full telephony history for one lead.
router.get("/crm/leads/:id/timeline", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const membership = await getCallerOrg(userId);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }
  const leadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(leadId)) {
    res.status(400).json({ error: "Invalid lead id" });
    return;
  }

  const leadRows = await db
    .select()
    .from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, membership.orgId)))
    .limit(1);
  if (leadRows.length === 0) {
    res.status(404).json({ error: "Lead not found in your organization" });
    return;
  }

  const activities = await db
    .select()
    .from(crmActivitiesTable)
    .where(and(eq(crmActivitiesTable.orgId, membership.orgId), eq(crmActivitiesTable.leadId, leadId)))
    .orderBy(desc(crmActivitiesTable.occurredAt))
    .limit(500);

  res.json({ lead: leadRows[0], activities });
});

// GET /api/crm/summary — per-channel + per-industry rollups for the org.
router.get("/crm/summary", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const membership = await getCallerOrg(userId);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }

  const byChannel = await db
    .select({
      channel: crmActivitiesTable.channel,
      direction: crmActivitiesTable.direction,
      count: sql<number>`count(*)::int`,
      totalDuration: sql<number>`coalesce(sum(${crmActivitiesTable.durationSeconds}), 0)::int`,
    })
    .from(crmActivitiesTable)
    .where(eq(crmActivitiesTable.orgId, membership.orgId))
    .groupBy(crmActivitiesTable.channel, crmActivitiesTable.direction);

  const orgRows = await db
    .select({ industry: organizationsTable.industry })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, membership.orgId))
    .limit(1);

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmActivitiesTable)
    .where(eq(crmActivitiesTable.orgId, membership.orgId));

  res.json({
    orgId: membership.orgId,
    industry: orgRows[0]?.industry ?? null,
    total: totalRow[0]?.count ?? 0,
    byChannel,
  });
});

export default router;
