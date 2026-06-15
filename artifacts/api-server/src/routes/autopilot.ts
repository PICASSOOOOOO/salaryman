import { Router, type Request, type Response } from "express";
import {
  db,
  botsTable,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  isAutopilotDomain,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import { getOrgAutopilotView, upsertDomainConfig } from "../lib/autopilot/config";
import { getRecentAutopilotActivity } from "../lib/autopilot/activity";

const router = Router();

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
router.get("/autopilot", async (req, res) => {
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
 * PUT /api/autopilot/:domain — set one domain's autopilot config (assign bot,
 * toggle on/off, optional caps). Owner/manager gated.
 */
router.put("/autopilot/:domain", async (req, res) => {
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

    const config = await upsertDomainConfig(orgId, domain, patch);
    res.json({ config });
  } catch (err) {
    console.error("[Autopilot] PUT /autopilot/:domain failed:", err);
    res.status(500).json({ error: "Failed to update autopilot" });
  }
});

export default router;
