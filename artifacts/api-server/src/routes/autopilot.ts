import { Router, type Request, type Response } from "express";
import {
  db,
  botsTable,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  AUTOPILOT_MARKETING_TONES,
  AUTOPILOT_CRM_LEAD_STATUSES,
  isAutopilotDomain,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getOrgAutopilotView, getDomainConfig, upsertDomainConfig } from "../lib/autopilot/config";
import { getRecentAutopilotActivity } from "../lib/autopilot/activity";
import { sanitizeMarketingPrefs } from "../lib/autopilot/marketing-prefs";
import { sanitizeBusinessOpsPrefs } from "../lib/autopilot/business-ops-prefs";
import { sanitizeCrmPrefs } from "../lib/autopilot/crm-prefs";
import { sanitizeAccountingPrefs } from "../lib/autopilot/accounting-prefs";
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

// Display labels for the CRM pipeline stages the bot can be told to work.
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
};

const router = Router();
const requireAutomationSubscription = requireFeature("claw_bot");

function getUserId(req: Request): string {
  return (req as Request & { user?: { id?: string } }).user?.id ?? "";
}

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

/**
 * GET /api/autopilot — the org's autopilot control surface: per-domain config
 * (merged with defaults), the org's assignable bots, and recent activity.
 * Owner/manager gated via the `autopilot.manage` org permission.
 */
router.get("/autopilot", requireAutomationSubscription, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);
  try {
    const orgId = await resolveCurrentOrgId(userId);
    if (!orgId) {
      res.status(404).json({ error: "No organization", domains: [], bots: [], activity: [] });
      return;
    }
    const check = await canDoInOrg(userId, orgId, "autopilot.manage");
    if (!check.allowed) {
      res.status(403).json({ error: "You do not have permission to manage autopilot", reason: check.reason });
      return;
    }

    const [domains, bots, activity] = await Promise.all([
      getOrgAutopilotView(orgId),
      db
        .select({ id: botsTable.id, name: botsTable.name, status: botsTable.status, department: botsTable.department })
        .from(botsTable)
        .where(eq(botsTable.orgId, orgId)),
      getRecentAutopilotActivity(orgId, { limit: 50 }),
    ]);

    res.json({
      orgId,
      meta: AUTOPILOT_DOMAIN_META,
      defaults: {
        cadenceMinutes: AUTOPILOT_DEFAULT_CADENCE_MINUTES,
        maxActionsPerTick: AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
      },
      marketing: {
        tones: AUTOPILOT_MARKETING_TONES,
        platforms: SOCIAL_PLATFORMS.map((id) => ({ id, label: MARKETING_PLATFORM_LABELS[id] ?? id })),
      },
      crm: {
        leadStatuses: AUTOPILOT_CRM_LEAD_STATUSES.map((id) => ({ id, label: CRM_LEAD_STATUS_LABELS[id] ?? id })),
      },
      domains,
      bots,
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
 * PUT /api/autopilot/:domain — set one domain's autopilot config (assign bot,
 * toggle on/off, optional caps). Owner/manager gated.
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
    const patch: Parameters<typeof upsertDomainConfig>[2] = { updatedBy: userId };

    if (body.enabled !== undefined) patch.enabled = !!body.enabled;

    if (body.botId !== undefined) {
      if (body.botId === null) {
        patch.botId = null;
      } else {
        const botId = Number(body.botId);
        if (!Number.isFinite(botId)) {
          res.status(400).json({ error: "Invalid botId" });
          return;
        }
        // Only bots belonging to this org may be assigned.
        const [bot] = await db.select({ orgId: botsTable.orgId }).from(botsTable).where(eq(botsTable.id, botId));
        if (!bot) {
          res.status(400).json({ error: "Bot not found" });
          return;
        }
        if (bot.orgId !== orgId) {
          res.status(400).json({ error: "That bot does not belong to this organization" });
          return;
        }
        patch.botId = botId;
      }
    }

    const clampInt = (v: unknown, min: number, max: number): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(Math.max(Math.round(n), min), max);
    };
    const cadence = clampInt(body.cadenceMinutes, 5, 1440);
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
        const incoming = body.prefs && typeof body.prefs === "object" ? (body.prefs as Record<string, unknown>) : {};
        const existing = await getDomainConfig(orgId, domain);
        patch.prefs = sanitize({ ...(existing?.prefs ?? {}), ...incoming });
      }
    }

    const config = await upsertDomainConfig(orgId, domain, patch);
    res.json({ config });
  } catch (err) {
    console.error("[Autopilot] PUT /autopilot/:domain failed:", err);
    res.status(500).json({ error: "Failed to update autopilot" });
  }
});

export default router;
