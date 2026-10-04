import { Router, type Request, type Response } from "express";
import {
  db,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
  AUTOPILOT_MARKETING_TONES,
  AUTOPILOT_CRM_LEAD_STATUSES,
  organizationsTable,
  projectsTable,
  isAutopilotDomain,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getOrgAutopilotView, getDomainConfig, upsertDomainConfig } from "../lib/autopilot/config";
import { getRecentAutopilotActivity } from "../lib/autopilot/activity";
import { sanitizeMarketingPrefs } from "../lib/autopilot/marketing-prefs";
import { sanitizeBusinessOpsPrefs } from "../lib/autopilot/business-ops-prefs";
import { sanitizeCrmPrefs } from "../lib/autopilot/crm-prefs";
import { sanitizeAccountingPrefs } from "../lib/autopilot/accounting-prefs";
import { sanitizeCreativeWorkPrefs } from "../lib/autopilot/creative-prefs";
import { SOCIAL_PLATFORMS } from "../lib/social-service";
import { requireFeature } from "../middlewares/requirePro";

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
       res.status(404).json({ error: "No organization", domains: [], activity: [] });
      return;
    }
    const check = await canDoInOrg(userId, orgId, "autopilot.manage");
    if (!check.allowed) {
      res.status(403).json({ error: "You do not have permission to manage autopilot", reason: check.reason });
      return;
    }

    const [domains, activity, org] = await Promise.all([
      getOrgAutopilotView(orgId),
      getRecentAutopilotActivity(orgId, { limit: 50 }),
      db.select({ ownerUserId: organizationsTable.ownerUserId })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    const canManageCreative = org?.ownerUserId === userId;
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
    const visibleDomains = canManageCreative
      ? domains
      : domains.map((domain) => domain.domain === "creative_work" ? { ...domain, prefs: {} } : domain);

    res.json({
      orgId,
      meta: AUTOPILOT_DOMAIN_META,
      defaults: {
        cadenceMinutes: AUTOPILOT_DEFAULT_CADENCE_MINUTES,
        creativeCadenceMinutes: AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
        maxActionsPerTick: AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
      },
      creative: { canManage: canManageCreative, projects: creativeProjects },
      marketing: {
        tones: AUTOPILOT_MARKETING_TONES,
        platforms: SOCIAL_PLATFORMS.map((id) => ({ id, label: MARKETING_PLATFORM_LABELS[id] ?? id })),
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

    const activity = await getRecentAutopilotActivity(orgId, { domain, limit, before });
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
    const cadenceMin = domain === "creative_work" ? AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES : 5;
    const cadenceMax = domain === "creative_work" ? AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES : 1440;
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
        const existing = domain === "creative_work" ? existingCreativeConfig : await getDomainConfig(orgId, domain);
        patch.prefs = sanitize({ ...(existing?.prefs ?? {}), ...incoming });
      }
    } else if (domain === "creative_work" && !existingCreativeConfig && creativePrefs) {
      patch.prefs = { projectId: creativePrefs.projectId };
    }

    const config = await upsertDomainConfig(orgId, domain, patch);
    res.json({ config: { ...config, botId: null } });
  } catch (err) {
    console.error("[Autopilot] PUT /autopilot/:domain failed:", err);
    res.status(500).json({ error: "Failed to update autopilot" });
  }
});

export default router;
