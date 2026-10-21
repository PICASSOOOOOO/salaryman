import { Router, type NextFunction, type Request, type Response } from "express";
import {
  db,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
  AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
  AUTOPILOT_MARKETING_TONES,
  AUTOPILOT_CRM_LEAD_STATUSES,
  autopilotActivityLogTable,
  autopilotReviewItemsTable,
  callHistoryTable,
  crmActivitiesTable,
  leadRecordsTable,
  organizationsTable,
  projectsTable,
  isAutopilotDomain,
  type AutopilotDomain,
} from "@workspace/db";
import { and, count, desc, eq, gte, inArray, isNotNull, notInArray } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getOrgAutopilotView, getDomainConfig, upsertDomainConfig } from "../lib/autopilot/config";
import { getRecentAutopilotActivity } from "../lib/autopilot/activity";
import { sanitizeMarketingPrefs } from "../lib/autopilot/marketing-prefs";
import { sanitizeBusinessOpsPrefs } from "../lib/autopilot/business-ops-prefs";
import { sanitizeCrmPrefs } from "../lib/autopilot/crm-prefs";
import { sanitizeAccountingPrefs } from "../lib/autopilot/accounting-prefs";
import { sanitizeCreativeWorkPrefs } from "../lib/autopilot/creative-prefs";
import { sanitizeMarketResearchPrefs } from "../lib/autopilot/market-research-prefs";
import { SOCIAL_PLATFORMS } from "../lib/social-service";
import { requireFeature } from "../middlewares/requirePro";
import { createBusinessTaskInTransaction } from "../lib/business-ops-service";
import { buildFollowUpTaskDraft } from "../lib/autopilot/review-items";
import { requireDesktopLink } from "../lib/desktop-link-auth";

// Display labels for the marketing platform allow-list, surfaced to the UI.
const MARKETING_PLATFORM_LABELS: Record<string, string> = {
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  youtube: "YouTube",
  bluesky: "Bluesky",
};

// Display labels for the CRM pipeline stages Pablo's automation can work.
const CRM_LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
};

// Per-domain prefs sanitizers. Each merges the incoming partial over what's
// stored and degrades any garbage to that domain's defaults, so a domain that
// is OFF (or never configured) keeps today's exact behavior.
const PREFS_SANITIZERS: Record<string, (raw: unknown) => Record<string, unknown>> = {
  marketing: (raw) => sanitizeMarketingPrefs(raw) as unknown as Record<string, unknown>,
  business_ops: (raw) => sanitizeBusinessOpsPrefs(raw) as unknown as Record<string, unknown>,
  crm_calls: (raw) => sanitizeCrmPrefs(raw) as unknown as Record<string, unknown>,
  accounting: (raw) => sanitizeAccountingPrefs(raw) as unknown as Record<string, unknown>,
  creative_work: (raw) => sanitizeCreativeWorkPrefs(raw) as unknown as Record<string, unknown>,
  market_research: (raw) => sanitizeMarketResearchPrefs(raw) as unknown as Record<string, unknown>,
};

const router = Router();
const requireAutomationSubscription = requireFeature("claw_bot");

function getUserId(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id ?? "";
}

function bodyObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

async function getManageableOrg(req: Request, res: Response): Promise<{ orgId: number; userId: string } | null> {
  if (!requireAuth(req, res)) return null;
  const userId = getUserId(req);
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.status(404).json({ error: "No organization" });
    return null;
  }
  const permission = await canDoInOrg(userId, orgId, "autopilot.manage");
  if (!permission.allowed) {
    res.status(403).json({ error: "You do not have permission to manage autopilot", reason: permission.reason });
    return null;
  }
  return { orgId, userId };
}

async function authenticateDesktopAutopilotRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const link = await requireDesktopLink(req, res);
    if (!link) return;

    // The device credential was verified above; adapt it to the same auth
    // contract used by the subscription and organization guards.
    Object.defineProperty(req, "user", {
      configurable: true,
      value: { id: link.userId },
    });
    Object.defineProperty(req, "isAuthenticated", {
      configurable: true,
      value: () => true,
    });
    next();
  } catch (error) {
    next(error);
  }
}

function toApprovalItem(row: typeof autopilotReviewItemsTable.$inferSelect) {
  return {
    id: row.id,
    callHistoryId: row.sourceCallId,
    sourceLeadId: row.sourceLeadId,
    sourceLeadName: row.sourceLeadName,
    sourceCallAt: row.sourceCallAt,
    sourceSummary: row.sourceSummary,
    taskTitle: row.taskTitle,
    taskDescription: row.taskDescription,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * GET /api/autopilot/brief — read-only snapshot of the last 24 hours for the
 * active organization. The response contract deliberately contains no finance
 * fields, so it cannot disclose financial data to non-finance viewers.
 */
router.get("/autopilot/brief", requireAutomationSubscription, async (req, res): Promise<void> => {
  const access = await getManageableOrg(req, res);
  if (!access) return;
  try {
    const { orgId } = access;
    const generatedAt = new Date();
    const windowStart = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
    const orgScope = eq(leadRecordsTable.orgId, orgId);
    const [
      [newLeadCount],
      [activeLeadCount],
      [totalCallCount],
      [inboundCallCount],
      [outboundCallCount],
      [pendingApprovalCount],
      recentCalls,
      runRows,
    ] = await Promise.all([
      db.select({ value: count() }).from(leadRecordsTable)
        .where(and(orgScope, gte(leadRecordsTable.createdAt, windowStart))),
      db.select({ value: count() }).from(leadRecordsTable)
        .where(and(orgScope, notInArray(leadRecordsTable.status, ["closed_won", "closed_lost"]))),
      db.select({ value: count() }).from(callHistoryTable)
        .where(and(eq(callHistoryTable.orgId, orgId), gte(callHistoryTable.startedAt, windowStart))),
      db.select({ value: count() }).from(callHistoryTable)
        .where(and(eq(callHistoryTable.orgId, orgId), gte(callHistoryTable.startedAt, windowStart), eq(callHistoryTable.direction, "inbound"))),
      db.select({ value: count() }).from(callHistoryTable)
        .where(and(eq(callHistoryTable.orgId, orgId), gte(callHistoryTable.startedAt, windowStart), eq(callHistoryTable.direction, "outbound"))),
      db.select({ value: count() }).from(autopilotReviewItemsTable)
        .where(and(eq(autopilotReviewItemsTable.orgId, orgId), eq(autopilotReviewItemsTable.status, "pending"))),
      db.select({
        id: callHistoryTable.id,
        callerName: callHistoryTable.callerName,
        startedAt: callHistoryTable.startedAt,
        summary: callHistoryTable.summary,
        crmLeadName: leadRecordsTable.name,
        crmContactName: crmActivitiesTable.contactName,
      }).from(callHistoryTable)
        .innerJoin(crmActivitiesTable, and(
          eq(crmActivitiesTable.orgId, orgId),
          eq(crmActivitiesTable.channel, "call"),
          eq(crmActivitiesTable.twilioSid, callHistoryTable.twilioCallSid),
        ))
        .leftJoin(leadRecordsTable, and(
          eq(leadRecordsTable.id, crmActivitiesTable.leadId),
          eq(leadRecordsTable.orgId, orgId),
        ))
        .where(and(
          eq(callHistoryTable.orgId, orgId),
          gte(callHistoryTable.startedAt, windowStart),
          eq(callHistoryTable.status, "completed"),
          isNotNull(callHistoryTable.summary),
        ))
        .orderBy(desc(callHistoryTable.startedAt))
        .limit(10),
      db.select({
        outcome: autopilotActivityLogTable.outcome,
        count: count(),
      }).from(autopilotActivityLogTable)
        .where(and(eq(autopilotActivityLogTable.orgId, orgId), gte(autopilotActivityLogTable.createdAt, windowStart)))
        .groupBy(autopilotActivityLogTable.outcome),
    ]);
    const recentCallIds = recentCalls.map((call) => call.id);
    const proposals = recentCallIds.length
      ? await db.select({
          sourceCallId: autopilotReviewItemsTable.sourceCallId,
          status: autopilotReviewItemsTable.status,
        }).from(autopilotReviewItemsTable)
          .where(and(
            eq(autopilotReviewItemsTable.orgId, orgId),
            inArray(autopilotReviewItemsTable.sourceCallId, recentCallIds),
          ))
      : [];
    const proposalByCall = new Map(proposals.map((proposal) => [proposal.sourceCallId, proposal.status]));
    const automationRuns = { success: 0, noop: 0, blocked: 0, error: 0, skipped: 0 };
    for (const row of runRows) {
      if (row.outcome in automationRuns) {
        automationRuns[row.outcome as keyof typeof automationRuns] += Number(row.count);
      }
    }
    res.json({
      generatedAt,
      windowStart,
      newLeads: Number(newLeadCount?.value ?? 0),
      activeLeads: Number(activeLeadCount?.value ?? 0),
      calls: {
        total: Number(totalCallCount?.value ?? 0),
        inbound: Number(inboundCallCount?.value ?? 0),
        outbound: Number(outboundCallCount?.value ?? 0),
      },
      pendingApprovals: Number(pendingApprovalCount?.value ?? 0),
      automationRuns,
      recentCalls: recentCalls.map((call) => ({
        id: call.id,
        leadName: call.crmLeadName || call.crmContactName || call.callerName || "Lead",
        startedAt: call.startedAt,
        summary: (call.summary || "").slice(0, 1000),
        hasProposal: proposalByCall.has(call.id),
        proposalStatus: proposalByCall.get(call.id) ?? null,
      })),
    });
  } catch (err) {
    req.log?.error({ err }, "Autopilot daily brief failed");
    res.status(500).json({ error: "Failed to load daily brief" });
  }
});

router.get("/autopilot/approval-queue", requireAutomationSubscription, async (req, res): Promise<void> => {
  const access = await getManageableOrg(req, res);
  if (!access) return;
  try {
    const rows = await db.select().from(autopilotReviewItemsTable)
      .where(and(
        eq(autopilotReviewItemsTable.orgId, access.orgId),
        eq(autopilotReviewItemsTable.status, "pending"),
      ))
      .orderBy(desc(autopilotReviewItemsTable.createdAt))
      .limit(100);
    res.json({ items: rows.map(toApprovalItem) });
  } catch (err) {
    req.log?.error({ err }, "Autopilot approval queue failed");
    res.status(500).json({ error: "Failed to load approval queue" });
  }
});

router.post("/autopilot/follow-up-suggestions", requireAutomationSubscription, async (req, res): Promise<void> => {
  const access = await getManageableOrg(req, res);
  if (!access) return;
  const callHistoryId = Number(req.body?.callHistoryId);
  if (!Number.isInteger(callHistoryId) || callHistoryId < 1) {
    res.status(400).json({ error: "A valid call history ID is required" });
    return;
  }
  try {
    const [call] = await db.select().from(callHistoryTable).where(and(
      eq(callHistoryTable.id, callHistoryId),
      eq(callHistoryTable.orgId, access.orgId),
      eq(callHistoryTable.status, "completed"),
    )).limit(1);
    if (!call?.summary?.trim() || !call.twilioCallSid) {
      res.status(404).json({ error: "Completed CRM call not found in this organization" });
      return;
    }
    const [activity] = await db.select({
      leadId: crmActivitiesTable.leadId,
      contactName: crmActivitiesTable.contactName,
    }).from(crmActivitiesTable).where(and(
      eq(crmActivitiesTable.orgId, access.orgId),
      eq(crmActivitiesTable.channel, "call"),
      eq(crmActivitiesTable.twilioSid, call.twilioCallSid),
    )).limit(1);
    if (!activity) {
      res.status(404).json({ error: "Completed CRM call not found in this organization" });
      return;
    }
    const lead = activity.leadId
      ? (await db.select({ id: leadRecordsTable.id, name: leadRecordsTable.name })
          .from(leadRecordsTable)
          .where(and(eq(leadRecordsTable.id, activity.leadId), eq(leadRecordsTable.orgId, access.orgId)))
          .limit(1))[0]
      : undefined;
    const sourceLeadName = lead?.name || activity.contactName || call.callerName || "Lead";
    const draft = buildFollowUpTaskDraft(sourceLeadName, call.summary);
    const [org] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, access.orgId))
      .limit(1);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(autopilotReviewItemsTable).where(and(
        eq(autopilotReviewItemsTable.orgId, access.orgId),
        eq(autopilotReviewItemsTable.sourceCallId, call.id),
      )).limit(1);
      if (existing) return { row: existing, duplicate: true };
      const [inserted] = await tx.insert(autopilotReviewItemsTable).values({
        orgId: access.orgId,
        ownerUserId: org.ownerUserId,
        sourceCallId: call.id,
        sourceLeadId: lead?.id ?? null,
        sourceLeadName,
        sourceCallAt: call.startedAt,
        sourceSummary: call.summary!,
        taskTitle: draft.title,
        taskDescription: draft.description,
        status: "pending",
        createdByUserId: access.userId,
      }).onConflictDoNothing().returning();
      if (inserted) return { row: inserted, duplicate: false };
      const [raced] = await tx.select().from(autopilotReviewItemsTable).where(and(
        eq(autopilotReviewItemsTable.orgId, access.orgId),
        eq(autopilotReviewItemsTable.sourceCallId, call.id),
      )).limit(1);
      if (!raced) throw new Error("Could not recover the existing follow-up suggestion");
      return { row: raced, duplicate: true };
    });
    res.json({ item: toApprovalItem(result.row), duplicate: result.duplicate });
  } catch (err) {
    req.log?.error({ err }, "Autopilot follow-up suggestion failed");
    res.status(500).json({ error: "Failed to create follow-up suggestion" });
  }
});

router.post("/autopilot/approval-queue/:id/decision", requireAutomationSubscription, async (req, res): Promise<void> => {
  const access = await getManageableOrg(req, res);
  if (!access) return;
  const id = Number(req.params.id);
  const decision = req.body?.decision;
  if (!Number.isInteger(id) || id < 1 || (decision !== "approved" && decision !== "dismissed")) {
    res.status(400).json({ error: "A valid review item and decision are required" });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(autopilotReviewItemsTable).where(and(
        eq(autopilotReviewItemsTable.id, id),
        eq(autopilotReviewItemsTable.orgId, access.orgId),
      )).for("update").limit(1);
      if (!item) return { kind: "missing" as const };
      if (item.status !== "pending") return { kind: "decided" as const };
      let businessTaskId: number | null = null;
      if (decision === "approved") {
        const task = await createBusinessTaskInTransaction(tx, item.ownerUserId, {
          title: item.taskTitle,
          description: item.taskDescription,
          status: "todo",
          priority: "medium",
          tags: "pablo-follow-up",
        });
        businessTaskId = task.id;
      }
      const [updated] = await tx.update(autopilotReviewItemsTable).set({
        status: decision,
        businessTaskId,
        decidedByUserId: access.userId,
        decidedAt: new Date(),
      }).where(and(
        eq(autopilotReviewItemsTable.id, item.id),
        eq(autopilotReviewItemsTable.orgId, access.orgId),
        eq(autopilotReviewItemsTable.status, "pending"),
      )).returning();
      return { kind: "updated" as const, item: updated, businessTaskId };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    if (outcome.kind === "decided") {
      res.status(409).json({ error: "Review item has already been decided" });
      return;
    }
    res.json({ item: toApprovalItem(outcome.item), businessTaskId: outcome.businessTaskId });
  } catch (err) {
    req.log?.error({ err }, "Autopilot review decision failed");
    res.status(500).json({ error: "Failed to record review decision" });
  }
});

/**
 * GET /api/autopilot — Pablo Prime's org-scoped automation control surface:
 * per-domain config (merged with defaults) and recent activity.
 * Owner/manager gated via the `autopilot.manage` org permission.
 */
router.get("/autopilot", requireAutomationSubscription, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (!orgId) {
      res.status(404).json({
        error: "No organization",
        domains: [],
        activity: [],
        accounting: { canManage: false },
      });
      return;
    }
    const check = await canDoInOrg(userId, orgId, "autopilot.manage");
    if (!check.allowed) {
      res.status(403).json({ error: "You do not have permission to manage autopilot", reason: check.reason });
      return;
    }

    const [domains, org, financeView, financeManage] = await Promise.all([
      getOrgAutopilotView(orgId),
      db.select({ ownerUserId: organizationsTable.ownerUserId })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1)
        .then((rows) => rows[0]),
      canDoInOrg(userId, orgId, "finance.view"),
      canDoInOrg(userId, orgId, "finance.manage"),
    ]);
    const canManageCreative = org?.ownerUserId === userId;
    const activity = await getRecentAutopilotActivity(orgId, {
      limit: 50,
      excludeDomain: canManageCreative ? undefined : "market_research",
      excludeDomains: financeView.allowed ? undefined : ["accounting"],
    });
    const creativeProjects = canManageCreative
      ? await db.select({
          id: projectsTable.id,
          name: projectsTable.name,
          type: projectsTable.type,
        })
          .from(projectsTable)
          .where(eq(projectsTable.userId, userId))
          .orderBy(desc(projectsTable.updatedAt))
          .limit(100)
      : [];
    const visibleDomains = domains.map((domain) => {
      if (domain.domain === "creative_work" || domain.domain === "market_research") {
        return canManageCreative ? domain : { ...domain, prefs: {} };
      }
      if (domain.domain === "marketing") {
        const prefs = domain.prefs && typeof domain.prefs === "object"
          ? domain.prefs as Record<string, unknown>
          : {};
        const approvedBy = prefs.imageGenerationApprovedBy;
        const { imageGenerationApprovedBy: _privateApproval, ...safePrefs } = prefs;
        return {
          ...domain,
          prefs: {
            ...safePrefs,
            generateImages: prefs.generateImages === true && approvedBy === org?.ownerUserId,
          },
        };
      }
      return domain;
    });

    res.json({
      orgId,
      meta: AUTOPILOT_DOMAIN_META,
      defaults: {
        cadenceMinutes: AUTOPILOT_DEFAULT_CADENCE_MINUTES,
        creativeCadenceMinutes: AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
        marketResearchCadenceMinutes: AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
        maxActionsPerTick: AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
      },
      creative: { canManage: canManageCreative, projects: creativeProjects },
      marketResearch: { canManage: canManageCreative },
      accounting: { canManage: financeManage.allowed },
      marketing: {
        tones: AUTOPILOT_MARKETING_TONES,
        platforms: SOCIAL_PLATFORMS.map((id) => ({ id, label: MARKETING_PLATFORM_LABELS[id] ?? id })),
        canApproveImageGeneration: org?.ownerUserId === userId,
      },
      crm: {
        leadStatuses: AUTOPILOT_CRM_LEAD_STATUSES.map((id) => ({ id, label: CRM_LEAD_STATUS_LABELS[id] ?? id })),
      },
      domains: visibleDomains,
      activity,
    });
  } catch (err) {
    console.error("[Autopilot] GET /autopilot failed:", err);
    res.status(500).json({ error: "Failed to load autopilot" });
  }
});

/**
 * GET /api/autopilot/activity — the org's autopilot activity feed, newest first.
 * Optional `?domain=` filter and `?limit=` (1–200). Owner/manager gated. Used by
 * the dashboard to poll for a live feed and to filter by domain without reloading
 * the whole control surface.
 */
router.get(
  "/autopilot/desktop-snapshot",
  authenticateDesktopAutopilotRequest,
  requireAutomationSubscription,
  async (req, res): Promise<void> => {
    const access = await getManageableOrg(req, res);
    if (!access) return;
    try {
      const [domains, org, financeView] = await Promise.all([
        getOrgAutopilotView(access.orgId),
        db.select({ ownerUserId: organizationsTable.ownerUserId })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, access.orgId))
          .limit(1)
          .then((rows) => rows[0]),
        canDoInOrg(access.userId, access.orgId, "finance.view"),
      ]);
      const isOwner = org?.ownerUserId === access.userId;
      const visibleDomains = domains.filter(({ domain }) => {
        if (domain === "accounting" && !financeView.allowed) return false;
        if ((domain === "creative_work" || domain === "market_research") && !isOwner) return false;
        return true;
      });

      res.json({
        snapshotAt: new Date().toISOString(),
        domains: visibleDomains.map(({ domain, enabled, lastRunAt }) => ({
          domain,
          enabled,
          lastRunAt: lastRunAt?.toISOString() ?? null,
        })),
      });
    } catch (err) {
      req.log?.error({ err }, "Desktop autopilot snapshot failed");
      res.status(500).json({ error: "Could not load automation status" });
    }
  },
);

router.get("/autopilot/activity", requireAutomationSubscription, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (!orgId) {
      res.status(404).json({ error: "No organization", activity: [] });
      return;
    }
    const check = await canDoInOrg(userId, orgId, "autopilot.manage");
    if (!check.allowed) {
      res.status(403).json({ error: "You do not have permission to manage autopilot", reason: check.reason });
      return;
    }

    const rawDomain = String(req.query.domain ?? "");
    const domain = isAutopilotDomain(rawDomain) ? rawDomain : undefined;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const rawBefore = Number(req.query.before);
    const before = Number.isFinite(rawBefore) && rawBefore > 0 ? rawBefore : undefined;

    const [org] = await db
      .select({ ownerUserId: organizationsTable.ownerUserId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    const financeView = await canDoInOrg(userId, orgId, "finance.view");
    const activity = await getRecentAutopilotActivity(orgId, {
      domain,
      excludeDomain: org?.ownerUserId === userId ? undefined : "market_research",
      excludeDomains: financeView.allowed ? undefined : ["accounting" as AutopilotDomain],
      limit,
      before,
    });
    res.json({
      activity,
      domain: domain ?? null,
      meta: AUTOPILOT_DOMAIN_META,
      hasMore: activity.length === limit,
    });
  } catch (err) {
    console.error("[Autopilot] GET /autopilot/activity failed:", err);
    res.status(500).json({ error: "Failed to load autopilot activity" });
  }
});

/**
 * PUT /api/autopilot/:domain — set one Pablo automation config (toggle on/off,
 * optional caps and preferences). Owner/manager gated.
 */
router.put("/autopilot/:domain", requireAutomationSubscription, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  const domain = String(req.params.domain ?? "");
  if (!isAutopilotDomain(domain)) {
    res.status(400).json({ error: "Unknown domain" });
    return;
  }
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (!orgId) {
      res.status(404).json({ error: "No organization" });
      return;
    }
    const check = await canDoInOrg(userId, orgId, "autopilot.manage");
    if (!check.allowed) {
      res.status(403).json({ error: "You do not have permission to manage autopilot", reason: check.reason });
      return;
    }

    const body = req.body ?? {};
    if (domain === "accounting") {
      const financeManage = await canDoInOrg(userId, orgId, "finance.manage");
      if (!financeManage.allowed) {
        const accountingBody = bodyObject(body);
        const keys = Object.keys(accountingBody);
        const disableOnly = accountingBody.enabled === false
          && keys.length === 1
          && keys[0] === "enabled";
        if (!disableOnly) {
          res.status(403).json({ error: "Finance manager permission is required to change Accounting automation" });
          return;
        }
      }
    }

    let creativePrefs: ReturnType<typeof sanitizeCreativeWorkPrefs> | null = null;
    let existingCreativeConfig: Awaited<ReturnType<typeof getDomainConfig>> = null;
    if (domain === "creative_work") {
      const [org] = await db
        .select({ ownerUserId: organizationsTable.ownerUserId })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1);
      if (org?.ownerUserId !== userId) {
        res.status(403).json({ error: "Only the organization owner can manage Creative Work" });
        return;
      }
      existingCreativeConfig = await getDomainConfig(orgId, domain);
      const incoming = bodyObject(body.prefs);
      creativePrefs = sanitizeCreativeWorkPrefs({
        ...(existingCreativeConfig?.prefs ?? {}),
        ...incoming,
      });

      const willBeEnabled = body.enabled !== undefined
        ? !!body.enabled
        : existingCreativeConfig?.enabled ?? false;
      if (willBeEnabled && creativePrefs.projectId === null) {
        res.status(400).json({ error: "Choose a workspace project before enabling Creative Work" });
        return;
      }
      if (creativePrefs.projectId !== null) {
        const [project] = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(and(
            eq(projectsTable.id, creativePrefs.projectId),
            eq(projectsTable.userId, userId),
          ))
          .limit(1);
        if (!project) {
          res.status(400).json({ error: "Choose a project owned by the organization owner" });
          return;
        }
      }
    }

    let researchPrefs: ReturnType<typeof sanitizeMarketResearchPrefs> | null = null;
    let existingResearchConfig: Awaited<ReturnType<typeof getDomainConfig>> = null;
    if (domain === "market_research") {
      const [org] = await db
        .select({ ownerUserId: organizationsTable.ownerUserId })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1);
      if (org?.ownerUserId !== userId) {
        res.status(403).json({ error: "Only the organization owner can manage Market Research" });
        return;
      }
      existingResearchConfig = await getDomainConfig(orgId, domain);
      const incoming = bodyObject(body.prefs);
      researchPrefs = sanitizeMarketResearchPrefs({
        ...(existingResearchConfig?.prefs ?? {}),
        ...incoming,
      });
      const willBeEnabled = body.enabled !== undefined
        ? !!body.enabled
        : existingResearchConfig?.enabled ?? false;
      if (willBeEnabled && !researchPrefs.subject && !researchPrefs.autoInvestigateRecentCalls) {
        res.status(400).json({ error: "Add a research topic or enable CRM call investigations before enabling Market Research" });
        return;
      }
    }

    const patch: Parameters<typeof upsertDomainConfig>[2] = { updatedBy: userId };

    if (body.botId !== undefined) {
      res.status(400).json({ error: "Pablo Prime owns automation; bot assignment is not supported" });
      return;
    }

    if (body.enabled !== undefined) patch.enabled = !!body.enabled;

    const clampInt = (v: unknown, min: number, max: number): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(Math.max(Math.round(n), min), max);
    };
    const fixedDailyCadence = domain === "creative_work"
      ? AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES
      : domain === "market_research"
        ? AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES
        : null;
    const cadenceMin = fixedDailyCadence ?? 5;
    const cadenceMax = fixedDailyCadence ?? 1440;
    const cadence = clampInt(body.cadenceMinutes, cadenceMin, cadenceMax);
    if (cadence !== undefined) patch.cadenceMinutes = cadence;
    const maxActions = clampInt(body.maxActionsPerTick, 1, 100);
    if (maxActions !== undefined) patch.maxActionsPerTick = maxActions;
    const budget = clampInt(body.budgetCapCents, 0, 10_000_000);
    if (budget !== undefined) patch.budgetCapCents = budget;

    // Domain-specific preferences. Each domain owns a sanitizer that merges the
    // incoming partial over the stored prefs and degrades any garbage to that
    // domain's defaults, so only a valid, complete shape ever lands in the jsonb.
    if (body.prefs !== undefined) {
      const sanitize = PREFS_SANITIZERS[domain];
      if (sanitize) {
        const incoming = bodyObject(body.prefs);
        const existing = domain === "creative_work"
          ? existingCreativeConfig
          : domain === "market_research"
            ? existingResearchConfig
            : await getDomainConfig(orgId, domain);
        if (domain === "marketing") {
          delete incoming.imageGenerationApprovedBy;
          if (incoming.generateImages === true) {
            const [org] = await db
              .select({ ownerUserId: organizationsTable.ownerUserId })
              .from(organizationsTable)
              .where(eq(organizationsTable.id, orgId))
              .limit(1);
            if (org?.ownerUserId !== userId) {
              res.status(403).json({ error: "Only the organization owner can approve automated image generation" });
              return;
            }
            incoming.imageGenerationApprovedBy = userId;
          } else if (incoming.generateImages === false) {
            incoming.imageGenerationApprovedBy = null;
          }
        }
        patch.prefs = sanitize({ ...(existing?.prefs ?? {}), ...incoming });
      }
    } else if (domain === "creative_work" && !existingCreativeConfig && creativePrefs) {
      patch.prefs = { ...creativePrefs };
    } else if (domain === "market_research" && !existingResearchConfig && researchPrefs) {
      patch.prefs = { ...researchPrefs };
    }

    const config = await upsertDomainConfig(orgId, domain, patch);
    if (domain === "marketing") {
      const prefs = config.prefs && typeof config.prefs === "object"
        ? config.prefs as Record<string, unknown>
        : {};
      const { imageGenerationApprovedBy: _privateApproval, ...safePrefs } = prefs;
      res.json({
        config: {
          ...config,
          botId: null,
          prefs: {
            ...safePrefs,
            generateImages: prefs.generateImages === true && prefs.imageGenerationApprovedBy === userId,
          },
        },
      });
      return;
    }
    res.json({ config: { ...config, botId: null } });
  } catch (err) {
    console.error("[Autopilot] PUT /autopilot/:domain failed:", err);
    res.status(500).json({ error: "Failed to update autopilot" });
  }
});

export default router;
