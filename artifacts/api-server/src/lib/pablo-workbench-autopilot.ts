import { and, eq } from "drizzle-orm";
import {
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
  AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
  autopilotConfigsTable,
  organizationsTable,
  projectsTable,
  isAutopilotDomain,
  type AutopilotDomain,
} from "@workspace/db";
import { db } from "@workspace/db";
import { canDoInOrg, resolveCurrentOrgId } from "./org-permissions";
import { getOrgAutopilotView, getDomainConfig, upsertDomainConfig } from "./autopilot/config";
import { sanitizeMarketingPrefs } from "./autopilot/marketing-prefs";
import { sanitizeBusinessOpsPrefs } from "./autopilot/business-ops-prefs";
import { sanitizeCrmPrefs } from "./autopilot/crm-prefs";
import { sanitizeAccountingPrefs } from "./autopilot/accounting-prefs";
import { sanitizeCreativeWorkPrefs } from "./autopilot/creative-prefs";
import { sanitizeMarketResearchPrefs } from "./autopilot/market-research-prefs";
import { hasFeature } from "./plan";
import { getCompletedOnboarding } from "../middlewares/requireOnboarding";

type WorkbenchOutcome = { message: string; data?: unknown };

const sanitizePrefs: Record<AutopilotDomain, (raw: unknown) => Record<string, unknown>> = {
  business_ops: (raw) => sanitizeBusinessOpsPrefs(raw) as unknown as Record<string, unknown>,
  marketing: (raw) => sanitizeMarketingPrefs(raw) as unknown as Record<string, unknown>,
  crm_calls: (raw) => sanitizeCrmPrefs(raw) as unknown as Record<string, unknown>,
  accounting: (raw) => sanitizeAccountingPrefs(raw) as unknown as Record<string, unknown>,
  creative_work: (raw) => sanitizeCreativeWorkPrefs(raw) as unknown as Record<string, unknown>,
  market_research: (raw) => sanitizeMarketResearchPrefs(raw) as unknown as Record<string, unknown>,
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function entitlementError(userId: string, email?: string | null): Promise<string | null> {
  if (!await getCompletedOnboarding(userId)) {
    return "Complete onboarding before using Pablo automation.";
  }
  if (!await hasFeature(userId, email, "claw_bot")) {
    return "Pablo Prime is required to manage automations. Open /pricing to review access.";
  }
  return null;
}

async function activeOrg(userId: string) {
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { error: "There is no active organization." } as const;
  const permission = await canDoInOrg(userId, orgId, "autopilot.manage");
  if (!permission.allowed) return { error: "You need autopilot manager permission in the active organization." } as const;
  return { orgId } as const;
}

export async function getPabloAutomationStatus(
  userId: string,
  email?: string | null,
): Promise<WorkbenchOutcome> {
  const denied = await entitlementError(userId, email);
  if (denied) return { message: denied };
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) return { message: "There is no active organization." };
  const [domains, org, financeView, crmView] = await Promise.all([
    getOrgAutopilotView(orgId),
    db.select({ ownerUserId: organizationsTable.ownerUserId })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1)
      .then((rows) => rows[0]),
    canDoInOrg(userId, orgId, "finance.view"),
    canDoInOrg(userId, orgId, "crm.view"),
  ]);
  const isOwner = org?.ownerUserId === userId;
  const visible = domains.flatMap((domain) => {
    if (domain.domain === "accounting" && !financeView.allowed) return [];
    if (domain.domain === "crm_calls" && !crmView.allowed) return [];
    const prefs = objectValue(domain.prefs);
    if (domain.domain === "creative_work" || domain.domain === "market_research") {
      if (!isOwner) return [{ ...domain, prefs: {} }];
    }
    if (domain.domain === "marketing") {
      const approvedBy = prefs.imageGenerationApprovedBy;
      delete prefs.imageGenerationApprovedBy;
      prefs.generateImages = prefs.generateImages === true && approvedBy === org?.ownerUserId;
    }
    return [{ ...domain, prefs }];
  });
  return {
    message: `Loaded ${visible.length} automation settings for the active organization.`,
    data: {
      meta: AUTOPILOT_DOMAIN_META,
      defaults: {
        cadenceMinutes: AUTOPILOT_DEFAULT_CADENCE_MINUTES,
        creativeCadenceMinutes: AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
        marketResearchCadenceMinutes: AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
        maxActionsPerTick: AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
      },
      domains: visible,
    },
  };
}

export async function updatePabloAutomation(
  userId: string,
  email: string | null | undefined,
  input: Record<string, unknown>,
): Promise<WorkbenchOutcome> {
  const denied = await entitlementError(userId, email);
  if (denied) return { message: denied };
  const domain = typeof input.domain === "string" ? input.domain : "";
  if (!isAutopilotDomain(domain)) return { message: "Choose a supported automation domain." };
  if (input.botId !== undefined) {
    return { message: "Pablo Prime is the automation runner; assigning another bot is not supported." };
  }
  const context = await activeOrg(userId);
  if ("error" in context) return { message: context.error ?? "Organization access is unavailable." };
  const { orgId } = context;
  const body = input;

  if (domain === "accounting") {
    const financeManage = await canDoInOrg(userId, orgId, "finance.manage");
    if (!financeManage.allowed) {
      const keys = Object.keys(body);
      const disableOnly = body.enabled === false && keys.length === 2 &&
        keys.includes("domain") && keys.includes("enabled");
      if (!disableOnly) {
        return { message: "Finance manager permission is required to change Accounting automation." };
      }
    }
  }

  const [organization] = await db.select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  const existing = await getDomainConfig(orgId, domain);
  const incomingPrefs = objectValue(body.prefs);

  if ((domain === "creative_work" || domain === "market_research") && organization?.ownerUserId !== userId) {
    return { message: `Only the organization owner can manage ${AUTOPILOT_DOMAIN_META[domain].label}.` };
  }

  let specialPrefs: Record<string, unknown> | null = null;
  if (domain === "creative_work") {
    const prefs = sanitizeCreativeWorkPrefs({ ...(existing?.prefs ?? {}), ...incomingPrefs });
    const willBeEnabled = body.enabled !== undefined ? body.enabled === true : existing?.enabled ?? false;
    if (willBeEnabled && prefs.projectId === null) {
      return { message: "Choose a workspace project before enabling Creative Work." };
    }
    if (prefs.projectId !== null) {
      const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(
        eq(projectsTable.id, prefs.projectId),
        eq(projectsTable.userId, userId),
      )).limit(1);
      if (!project) return { message: "Choose a project owned by the organization owner." };
    }
    specialPrefs = prefs as unknown as Record<string, unknown>;
  } else if (domain === "market_research") {
    const prefs = sanitizeMarketResearchPrefs({ ...(existing?.prefs ?? {}), ...incomingPrefs });
    const willBeEnabled = body.enabled !== undefined ? body.enabled === true : existing?.enabled ?? false;
    if (willBeEnabled && !prefs.subject && !prefs.autoInvestigateRecentCalls) {
      return { message: "Add a research topic or enable CRM call investigations before enabling Market Research." };
    }
    specialPrefs = prefs as unknown as Record<string, unknown>;
  }

  const patch: Parameters<typeof upsertDomainConfig>[2] = { updatedBy: userId };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { message: "enabled must be true or false." };
    patch.enabled = body.enabled;
  }
  const clamp = (value: unknown, min: number, max: number): number | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.min(Math.max(Math.round(parsed), min), max);
  };
  const fixedCadence = domain === "creative_work"
    ? AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES
    : domain === "market_research"
      ? AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES
      : null;
  const cadence = clamp(body.cadenceMinutes, fixedCadence ?? 5, fixedCadence ?? 1440);
  const maxActions = clamp(body.maxActionsPerTick, 1, 100);
  const budget = clamp(body.budgetCapCents, 0, 10_000_000);
  if (cadence !== undefined) patch.cadenceMinutes = cadence;
  if (maxActions !== undefined) patch.maxActionsPerTick = maxActions;
  if (budget !== undefined) patch.budgetCapCents = budget;

  if (body.prefs !== undefined) {
    const prefs = { ...(existing?.prefs ?? {}), ...incomingPrefs };
    if (domain === "marketing") {
      delete prefs.imageGenerationApprovedBy;
      if (incomingPrefs.generateImages === true) {
        if (organization?.ownerUserId !== userId) {
          return { message: "Only the organization owner can approve automated image generation." };
        }
        prefs.imageGenerationApprovedBy = userId;
      } else if (incomingPrefs.generateImages === false) {
        prefs.imageGenerationApprovedBy = null;
      }
    }
    patch.prefs = specialPrefs ?? sanitizePrefs[domain](prefs);
  } else if (specialPrefs && !existing) {
    patch.prefs = specialPrefs;
  }

  const config = await upsertDomainConfig(orgId, domain, patch);
  const responsePrefs = objectValue(config.prefs);
  if (domain === "marketing") {
    const approvedBy = responsePrefs.imageGenerationApprovedBy;
    delete responsePrefs.imageGenerationApprovedBy;
    responsePrefs.generateImages = responsePrefs.generateImages === true && approvedBy === userId;
  }
  return {
    message: `Updated ${AUTOPILOT_DOMAIN_META[domain].label} automation. It is ${config.enabled ? "on" : "off"}.`,
    data: { config: { ...config, botId: null, prefs: responsePrefs } },
  };
}
