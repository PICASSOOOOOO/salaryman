import { Router, type Request, type Response } from "express";
import { and, eq, desc, sql, or } from "drizzle-orm";
import {
  db,
  crmActivitiesTable,
  crmLeadRoutingTable,
  crmRoutingProfilesTable,
  CRM_COMMS_TARGETS,
  CRM_ROUTE_CHANNELS,
  CRM_ROUTE_FALLBACKS,
  leadRecordsTable,
  orgMembersTable,
  organizationsTable,
  phoneNumbersTable,
  usersTable,
} from "@workspace/db";
import { canDoInOrg } from "../lib/org-permissions";
import { hasFeature } from "../lib/plan";
import { sendSmsMessage } from "../lib/telephony-service";
import { recordCommsActivity } from "../lib/crm-recorder";
import { postBotMessageToCompanyChannel, postBotMessageToPrivateChannel } from "./chat";

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

// Resolve which org's CRM the caller scopes to. Prefers an active membership;
// falls back to an org the caller OWNS so the owner-override in canDoInOrg is
// honored even when the owner's member row is missing/odd.
async function resolveCrmOrgId(userId: string): Promise<number | null> {
  const membership = await getCallerOrg(userId);
  if (membership) return membership.orgId;
  const owned = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.ownerUserId, userId))
    .limit(1);
  return owned[0]?.id ?? null;
}

// GET /api/crm/activities — org-wide telephony feed (calls, voicemails, SMS).
// Filters: leadId, channel, phone, direction, limit. Visible to all org members.
router.get("/crm/activities", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const orgId = await resolveCrmOrgId(userId);
  if (orgId === null) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }
  const crmGate = await canDoInOrg(userId, orgId, "crm.view");
  if (!crmGate.allowed) {
    res.status(403).json({ error: "You don't have permission to view the org CRM" });
    return;
  }

  const { leadId, channel, phone, direction } = req.query as Record<string, string>;
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "100", 10) || 100, 1), 500);

  const conditions = [eq(crmActivitiesTable.orgId, orgId)];
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

  res.json({ activities, orgId: orgId });
});

// GET /api/crm/leads/:id/timeline — full telephony history for one lead.
router.get("/crm/leads/:id/timeline", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const orgId = await resolveCrmOrgId(userId);
  if (orgId === null) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }
  const crmGate = await canDoInOrg(userId, orgId, "crm.view");
  if (!crmGate.allowed) {
    res.status(403).json({ error: "You don't have permission to view the org CRM" });
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
    .where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, orgId)))
    .limit(1);
  if (leadRows.length === 0) {
    res.status(404).json({ error: "Lead not found in your organization" });
    return;
  }

  const activities = await db
    .select()
    .from(crmActivitiesTable)
    .where(and(eq(crmActivitiesTable.orgId, orgId), eq(crmActivitiesTable.leadId, leadId)))
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
  const orgId = await resolveCrmOrgId(userId);
  if (orgId === null) {
    res.status(403).json({ error: "You are not a member of any organization" });
    return;
  }
  const crmGate = await canDoInOrg(userId, orgId, "crm.view");
  if (!crmGate.allowed) {
    res.status(403).json({ error: "You don't have permission to view the org CRM" });
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
    .where(eq(crmActivitiesTable.orgId, orgId))
    .groupBy(crmActivitiesTable.channel, crmActivitiesTable.direction);

  const orgRows = await db
    .select({ industry: organizationsTable.industry })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmActivitiesTable)
    .where(eq(crmActivitiesTable.orgId, orgId));

  res.json({
    orgId: orgId,
    industry: orgRows[0]?.industry ?? null,
    total: totalRow[0]?.count ?? 0,
    byChannel,
  });
});

function isRouteChannel(value: unknown): value is (typeof CRM_ROUTE_CHANNELS)[number] {
  return typeof value === "string" && (CRM_ROUTE_CHANNELS as readonly string[]).includes(value);
}

function isFallbackChannel(value: unknown): value is (typeof CRM_ROUTE_FALLBACKS)[number] {
  return typeof value === "string" && (CRM_ROUTE_FALLBACKS as readonly string[]).includes(value);
}

function isCommsTarget(value: unknown): value is (typeof CRM_COMMS_TARGETS)[number] {
  return typeof value === "string" && (CRM_COMMS_TARGETS as readonly string[]).includes(value);
}

async function getRoutingResources(orgId: number, userId: string) {
  const [profiles, phoneNumbers, members] = await Promise.all([
    db.select().from(crmRoutingProfilesTable)
      .where(and(eq(crmRoutingProfilesTable.orgId, orgId), eq(crmRoutingProfilesTable.isActive, true)))
      .orderBy(desc(crmRoutingProfilesTable.isDefault), crmRoutingProfilesTable.name),
    db.select({
      id: phoneNumbersTable.id,
      number: phoneNumbersTable.number,
      label: phoneNumbersTable.label,
      friendlyName: phoneNumbersTable.friendlyName,
      orgId: phoneNumbersTable.orgId,
      userId: phoneNumbersTable.userId,
      countryCode: phoneNumbersTable.countryCode,
    }).from(phoneNumbersTable).where(and(
      eq(phoneNumbersTable.isActive, true),
      or(eq(phoneNumbersTable.orgId, orgId), eq(phoneNumbersTable.userId, userId)),
    )),
    db.select({
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    }).from(orgMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, orgMembersTable.userId))
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active"))),
  ]);
  return { profiles, phoneNumbers, members };
}

async function ensureDefaultRoutingProfile(orgId: number, userId: string) {
  const [existing] = await db.select().from(crmRoutingProfilesTable)
    .where(and(eq(crmRoutingProfilesTable.orgId, orgId), eq(crmRoutingProfilesTable.isDefault, true), eq(crmRoutingProfilesTable.isActive, true)))
    .limit(1);
  if (existing) return existing;
  try {
    const [created] = await db.insert(crmRoutingProfilesTable).values({
      orgId,
      name: "Default",
      primaryChannel: "sms",
      fallbackChannel: "comms",
      commsTarget: "company",
      isDefault: true,
      createdByUserId: userId,
    }).returning();
    return created;
  } catch {
    const [raceWinner] = await db.select().from(crmRoutingProfilesTable)
      .where(and(eq(crmRoutingProfilesTable.orgId, orgId), eq(crmRoutingProfilesTable.isDefault, true), eq(crmRoutingProfilesTable.isActive, true)))
      .limit(1);
    return raceWinner;
  }
}

async function assertRoutingDestinations(input: {
  orgId: number;
  userId: string;
  phoneNumberId?: number | null;
  commsUserId?: string | null;
}) {
  if (input.phoneNumberId != null) {
    const [number] = await db.select({ id: phoneNumbersTable.id })
      .from(phoneNumbersTable)
      .where(and(
        eq(phoneNumbersTable.id, input.phoneNumberId),
        eq(phoneNumbersTable.isActive, true),
        or(eq(phoneNumbersTable.orgId, input.orgId), eq(phoneNumbersTable.userId, input.userId)),
      ))
      .limit(1);
    if (!number) return "Selected phone number is not available to this organization";
  }
  if (input.commsUserId) {
    const [member] = await db.select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(
        eq(orgMembersTable.orgId, input.orgId),
        eq(orgMembersTable.userId, input.commsUserId),
        eq(orgMembersTable.status, "active"),
      ))
      .limit(1);
    if (!member) return "COMMS recipient is not an active organization member";
  }
  return null;
}

async function resolveLeadRouting(orgId: number, leadId: number, userId: string) {
  const [override] = await db.select().from(crmLeadRoutingTable)
    .where(and(eq(crmLeadRoutingTable.orgId, orgId), eq(crmLeadRoutingTable.leadId, leadId)))
    .limit(1);
  const defaultProfile = await ensureDefaultRoutingProfile(orgId, userId);
  const [profile] = override?.profileId
    ? await db.select().from(crmRoutingProfilesTable)
      .where(and(eq(crmRoutingProfilesTable.id, override.profileId), eq(crmRoutingProfilesTable.orgId, orgId)))
      .limit(1)
    : defaultProfile ? [defaultProfile] : [];
  return {
    override: override ?? null,
    profile: profile ?? defaultProfile ?? null,
    route: {
      primaryChannel: override?.primaryChannel || profile?.primaryChannel || "sms",
      fallbackChannel: override?.fallbackChannel || profile?.fallbackChannel || "comms",
      phoneNumberId: override?.phoneNumberId ?? profile?.phoneNumberId ?? null,
      commsTarget: override?.commsTarget || profile?.commsTarget || "company",
      commsUserId: override?.commsUserId ?? profile?.commsUserId ?? null,
      profileId: override?.profileId ?? profile?.id ?? null,
    },
  };
}

router.get("/crm/routing", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  if (orgId === null) { res.status(403).json({ error: "You are not a member of any organization" }); return; }
  const gate = await canDoInOrg(userId, orgId, "crm.view");
  if (!gate.allowed) { res.status(403).json({ error: "You don't have permission to view CRM routing" }); return; }
  const defaultProfile = await ensureDefaultRoutingProfile(orgId, userId);
  const resources = await getRoutingResources(orgId, userId);
  res.json({
    ...resources,
    defaultProfileId: defaultProfile?.id ?? null,
    canEdit: (await canDoInOrg(userId, orgId, "crm.edit")).allowed,
  });
});

router.post("/crm/routing/profiles", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  if (orgId === null) { res.status(403).json({ error: "Organization required" }); return; }
  if (!(await canDoInOrg(userId, orgId, "crm.edit")).allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name || !isRouteChannel(body.primaryChannel) || !isFallbackChannel(body.fallbackChannel) || !isCommsTarget(body.commsTarget)) {
    res.status(400).json({ error: "name, primaryChannel, fallbackChannel and commsTarget are required" });
    return;
  }
  const phoneNumberId = body.phoneNumberId == null || body.phoneNumberId === "" ? null : Number(body.phoneNumberId);
  const commsUserId = body.commsUserId ? String(body.commsUserId) : null;
  const destinationError = await assertRoutingDestinations({ orgId, userId, phoneNumberId: Number.isFinite(phoneNumberId) ? phoneNumberId : null, commsUserId });
  if (destinationError) { res.status(400).json({ error: destinationError }); return; }
  const [profile] = await db.insert(crmRoutingProfilesTable).values({
    orgId, name, primaryChannel: body.primaryChannel, fallbackChannel: body.fallbackChannel,
    phoneNumberId: Number.isFinite(phoneNumberId) ? phoneNumberId : null,
    commsTarget: body.commsTarget, commsUserId, isDefault: Boolean(body.isDefault), createdByUserId: userId,
  }).returning();
  if (profile?.isDefault) {
    await db.update(crmRoutingProfilesTable).set({ isDefault: false })
      .where(and(eq(crmRoutingProfilesTable.orgId, orgId), sql`${crmRoutingProfilesTable.id} <> ${profile.id}`));
    await db.update(crmRoutingProfilesTable).set({ isDefault: true }).where(eq(crmRoutingProfilesTable.id, profile.id));
  }
  res.status(201).json({ profile });
});

router.patch("/crm/routing/profiles/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  const profileId = Number(req.params.id);
  if (orgId === null || !Number.isFinite(profileId)) { res.status(400).json({ error: "Invalid routing profile" }); return; }
  if (!(await canDoInOrg(userId, orgId, "crm.edit")).allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const [current] = await db.select().from(crmRoutingProfilesTable)
    .where(and(eq(crmRoutingProfilesTable.id, profileId), eq(crmRoutingProfilesTable.orgId, orgId), eq(crmRoutingProfilesTable.isActive, true))).limit(1);
  if (!current) { res.status(404).json({ error: "Routing profile not found" }); return; }
  const body = req.body ?? {};
  const values = {
    name: body.name == null ? current.name : String(body.name).trim().slice(0, 120),
    primaryChannel: body.primaryChannel == null ? current.primaryChannel : body.primaryChannel,
    fallbackChannel: body.fallbackChannel == null ? current.fallbackChannel : body.fallbackChannel,
    phoneNumberId: body.phoneNumberId === null || body.phoneNumberId === "" ? null : body.phoneNumberId == null ? current.phoneNumberId : Number(body.phoneNumberId),
    commsTarget: body.commsTarget == null ? current.commsTarget : body.commsTarget,
    commsUserId: body.commsUserId === "" ? null : body.commsUserId == null ? current.commsUserId : String(body.commsUserId),
    updatedAt: new Date(),
  };
  if (!values.name || !isRouteChannel(values.primaryChannel) || !isFallbackChannel(values.fallbackChannel) || !isCommsTarget(values.commsTarget)) {
    res.status(400).json({ error: "Invalid routing profile values" }); return;
  }
  const destinationError = await assertRoutingDestinations({ orgId, userId, phoneNumberId: Number.isFinite(values.phoneNumberId) ? values.phoneNumberId : null, commsUserId: values.commsUserId });
  if (destinationError) { res.status(400).json({ error: destinationError }); return; }
  const [profile] = await db.update(crmRoutingProfilesTable).set(values)
    .where(eq(crmRoutingProfilesTable.id, profileId)).returning();
  res.json({ profile });
});

router.get("/crm/leads/:id/routing", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  const leadId = Number(req.params.id);
  if (orgId === null || !Number.isFinite(leadId)) { res.status(400).json({ error: "Invalid lead id" }); return; }
  if (!(await canDoInOrg(userId, orgId, "crm.view")).allowed) { res.status(403).json({ error: "CRM view permission required" }); return; }
  const [lead] = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, orgId))).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  res.json(await resolveLeadRouting(orgId, leadId, userId));
});

router.put("/crm/leads/:id/routing", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  const leadId = Number(req.params.id);
  if (orgId === null || !Number.isFinite(leadId)) { res.status(400).json({ error: "Invalid lead id" }); return; }
  if (!(await canDoInOrg(userId, orgId, "crm.edit")).allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const [lead] = await db.select({ id: leadRecordsTable.id }).from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, orgId))).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  const body = req.body ?? {};
  const profileId = body.profileId == null || body.profileId === "" ? null : Number(body.profileId);
  if (profileId != null) {
    const [profile] = await db.select({ id: crmRoutingProfilesTable.id }).from(crmRoutingProfilesTable)
      .where(and(eq(crmRoutingProfilesTable.id, profileId), eq(crmRoutingProfilesTable.orgId, orgId), eq(crmRoutingProfilesTable.isActive, true))).limit(1);
    if (!profile) { res.status(400).json({ error: "Routing profile does not belong to this organization" }); return; }
  }
  const primaryChannel = body.primaryChannel == null || body.primaryChannel === "" ? null : body.primaryChannel;
  const fallbackChannel = body.fallbackChannel == null || body.fallbackChannel === "" ? null : body.fallbackChannel;
  const commsTarget = body.commsTarget == null || body.commsTarget === "" ? null : body.commsTarget;
  if ((primaryChannel && !isRouteChannel(primaryChannel)) || (fallbackChannel && !isFallbackChannel(fallbackChannel)) || (commsTarget && !isCommsTarget(commsTarget))) {
    res.status(400).json({ error: "Invalid lead routing values" }); return;
  }
  const phoneNumberId = body.phoneNumberId == null || body.phoneNumberId === "" ? null : Number(body.phoneNumberId);
  const commsUserId = body.commsUserId == null || body.commsUserId === "" ? null : String(body.commsUserId);
  const destinationError = await assertRoutingDestinations({ orgId, userId, phoneNumberId: Number.isFinite(phoneNumberId) ? phoneNumberId : null, commsUserId });
  if (destinationError) { res.status(400).json({ error: destinationError }); return; }
  if (!profileId && !primaryChannel && !fallbackChannel && !phoneNumberId && !commsTarget && !commsUserId) {
    await db.delete(crmLeadRoutingTable).where(and(eq(crmLeadRoutingTable.orgId, orgId), eq(crmLeadRoutingTable.leadId, leadId)));
  } else {
    const [existing] = await db.select({ id: crmLeadRoutingTable.id }).from(crmLeadRoutingTable)
      .where(eq(crmLeadRoutingTable.leadId, leadId)).limit(1);
    const values = { orgId, leadId, profileId, primaryChannel, fallbackChannel, phoneNumberId: Number.isFinite(phoneNumberId) ? phoneNumberId : null, commsTarget, commsUserId, updatedByUserId: userId, updatedAt: new Date() };
    if (existing) await db.update(crmLeadRoutingTable).set(values).where(eq(crmLeadRoutingTable.id, existing.id));
    else await db.insert(crmLeadRoutingTable).values(values);
  }
  res.json(await resolveLeadRouting(orgId, leadId, userId));
});

router.post("/crm/leads/:id/route", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Login required" }); return; }
  const orgId = await resolveCrmOrgId(userId);
  const leadId = Number(req.params.id);
  if (orgId === null || !Number.isFinite(leadId)) { res.status(400).json({ error: "Invalid lead id" }); return; }
  if (!(await canDoInOrg(userId, orgId, "crm.edit")).allowed) { res.status(403).json({ error: "CRM edit permission required" }); return; }
  const [lead] = await db.select().from(leadRecordsTable)
    .where(and(eq(leadRecordsTable.id, leadId), eq(leadRecordsTable.orgId, orgId))).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  const { route } = await resolveLeadRouting(orgId, leadId, userId);
  const requestedChannel = req.body?.channel;
  const channels = requestedChannel ? [requestedChannel] : [route.primaryChannel, route.fallbackChannel];
  const body = String(req.body?.body || "").trim();
  const org = (await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1))[0];
  const phoneAccess = await hasFeature(userId, req.user?.email, "phone_system");
  let lastError = "No usable routing channel";

  for (const channel of channels) {
    if (channel === "none") continue;
    if (channel === "sms") {
      if (!phoneAccess) { lastError = "Phone System access is required for SMS"; continue; }
      if (!lead.phone) { lastError = "Lead has no phone number"; continue; }
      if (!body) { res.status(400).json({ error: "Message body required for SMS" }); return; }
      try {
        const sent = await sendSmsMessage({
          userId,
          userEmail: req.user?.email,
          orgId,
          phone: lead.phone,
          body,
          contactName: lead.name,
          phoneNumberId: route.phoneNumberId,
        });
        if (lead.status === "new") await db.update(leadRecordsTable).set({ status: "contacted", updatedAt: new Date() }).where(eq(leadRecordsTable.id, leadId));
        res.json({ ok: true, channel: "sms", toPhone: sent.toPhone, messageId: sent.message.id });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "SMS failed";
      }
      continue;
    }
    if (channel === "call") {
      if (!phoneAccess) { lastError = "Phone System access is required for calls"; continue; }
      if (!lead.phone) { lastError = "Lead has no phone number"; continue; }
      res.json({ ok: true, channel: "call", handoffUrl: `/phone?tab=cc&leadId=${leadId}`, phone: lead.phone });
      return;
    }
    if (channel === "comms") {
      if (!body) { res.status(400).json({ error: "Handoff message required for COMMS" }); return; }
      const content = `CRM HANDOFF · ${lead.name}${lead.company ? ` · ${lead.company}` : ""}${lead.phone ? ` · ${lead.phone}` : ""}\n${body}`;
      const channelId = route.commsTarget === "assigned" && (route.commsUserId || lead.assignedUserId)
        ? await postBotMessageToPrivateChannel(userId, route.commsUserId || lead.assignedUserId!, content)
        : await postBotMessageToCompanyChannel(orgId, org?.name || "Company", content);
      const activityId = await recordCommsActivity({ userId, orgId, leadId, body, summary: `Routed to ${route.commsTarget === "assigned" ? "assigned salesperson" : "company COMMS"}` });
      if (lead.status === "new") await db.update(leadRecordsTable).set({ status: "contacted", updatedAt: new Date() }).where(eq(leadRecordsTable.id, leadId));
      res.json({ ok: true, channel: "comms", channelId, activityId });
      return;
    }
  }
  res.status(400).json({ error: lastError });
});

export default router;
