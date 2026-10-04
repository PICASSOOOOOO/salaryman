import {
  db,
  autopilotConfigsTable,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
  AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
  type AutopilotConfig,
  type AutopilotDomain,
} from "@workspace/db";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { recordAutopilotActivity } from "./activity";
import { evaluateConfigGuardrails, checkEntitlement, checkCredit } from "./guardrails";
import { AUTOPILOT_ASSISTANT_NAME, type AutopilotContext, type AutopilotHandler, type AutopilotLogInput } from "./types";

// ─── Autopilot engine ────────────────────────────────────────────────────────
// A SINGLE server-side recurring scheduler. Each base tick it finds orgs with an
// enabled domain whose cadence has elapsed, clears the shared guardrails, and
// invokes that domain's registered handler as Pablo Prime.

// ── Handler registry ─────────────────────────────────────────────────────────
const noopHandler: AutopilotHandler = async (ctx) => {
  // Safe fallback if a supported handler was not registered during server boot.
  await ctx.log({
    action: "tick",
    summary: `${ctx.domain} has no registered automation handler.`,
    outcome: "noop",
  });
};

const handlers: Record<AutopilotDomain, AutopilotHandler> = {
  business_ops: noopHandler,
  marketing: noopHandler,
  crm_calls: noopHandler,
  accounting: noopHandler,
  creative_work: noopHandler,
  market_research: noopHandler,
};

/** Register the handler for a domain during server boot. */
export function registerAutopilotHandler(domain: AutopilotDomain, handler: AutopilotHandler): void {
  handlers[domain] = handler;
}

// ── Tick scheduling ──────────────────────────────────────────────────────────
const BASE_TICK_MS = 60_000; // evaluate every minute; per-config cadence gates actual runs
let schedulerInterval: NodeJS.Timeout | null = null;
let ticking = false; // reentrancy guard: never overlap two evaluation passes

function cadenceElapsed(config: AutopilotConfig, now: number): boolean {
  if (!config.lastRunAt) return true;
  const cadenceMin = minimumCadence(config);
  const dueAt = new Date(config.lastRunAt).getTime() + cadenceMin * 60_000;
  return now >= dueAt;
}

function minimumCadence(config: AutopilotConfig): number {
  if (config.domain === "creative_work") {
    return Math.max(config.cadenceMinutes ?? AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES, AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES);
  }
  if (config.domain === "market_research") {
    return Math.max(config.cadenceMinutes ?? AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES, AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES);
  }
  return config.cadenceMinutes ?? AUTOPILOT_DEFAULT_CADENCE_MINUTES;
}

/**
 * Atomically claim a due config so separate API server instances cannot run
 * the same org/domain concurrently. The database predicate rechecks enabled
 * state and cadence after the scheduler's read.
 */
export async function claimAutopilotRunSlot(config: AutopilotConfig, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - minimumCadence(config) * 60_000);
  const [claimed] = await db
    .update(autopilotConfigsTable)
    .set({ lastRunAt: now })
    .where(and(
      eq(autopilotConfigsTable.id, config.id),
      eq(autopilotConfigsTable.enabled, true),
      or(isNull(autopilotConfigsTable.lastRunAt), lte(autopilotConfigsTable.lastRunAt, cutoff)),
    ))
    .returning({ id: autopilotConfigsTable.id });
  return !!claimed;
}

/** Build the per-run context handed to a domain handler. */
function buildContext(
  config: AutopilotConfig,
  pass: { ownerId: string; ownerEmail: string | null; maxActions: number }
): AutopilotContext {
  const domain = config.domain as AutopilotDomain;
  let actionsUsed = 0;

  const log = (input: AutopilotLogInput) =>
    recordAutopilotActivity({
      orgId: config.orgId,
      domain,
      botId: null,
      action: input.action,
      summary: input.summary,
      outcome: input.outcome,
      detail: input.detail,
    });

  const ctx: AutopilotContext = {
    orgId: config.orgId,
    domain,
    config,
    assistantName: AUTOPILOT_ASSISTANT_NAME,
    ownerId: pass.ownerId,
    ownerEmail: pass.ownerEmail,
    maxActions: pass.maxActions,
    log,
    claimAction() {
      if (actionsUsed >= pass.maxActions) {
        void log({
          action: "blocked",
          summary: `Per-tick action cap (${pass.maxActions}) reached; remaining actions deferred to next run.`,
          outcome: "blocked",
          detail: { check: "action_cap", cap: pass.maxActions },
        });
        return false;
      }
      actionsUsed++;
      return true;
    },
    async ensureEntitlement(feature = "claw_bot") {
      const ok = await checkEntitlement(pass.ownerId, pass.ownerEmail, feature);
      if (!ok) {
        await log({
          action: "blocked",
          summary: `Skipped a gated action — the org owner lacks the required entitlement (${feature}).`,
          outcome: "blocked",
          detail: { check: "entitlement", feature },
        });
      }
      return ok;
    },
    async ensureCredit() {
      const r = await checkCredit(pass.ownerId, pass.ownerEmail);
      if (!r.allowed) {
        await log({
          action: "blocked",
          summary: `Skipped a paid AI action — credit preflight failed${r.reason ? `: ${r.reason}` : ""}.`,
          outcome: "blocked",
          detail: { check: "credit", reason: r.reason },
        });
      }
      return r.allowed;
    },
  };
  return ctx;
}

/** Process one config: atomic cadence claim → guardrails → handler. */
async function runConfig(config: AutopilotConfig, now: Date): Promise<void> {
  if (!(await claimAutopilotRunSlot(config, now))) return;
  const guard = await evaluateConfigGuardrails(config, AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);

  if (!guard.ok) {
    await recordAutopilotActivity({
      orgId: config.orgId,
      domain: config.domain as AutopilotDomain,
      botId: null,
      action: "blocked",
      summary: `Autopilot could not run: ${guard.reason.replace(/_/g, " ")}.`,
      outcome: "blocked",
      detail: { check: "guardrail", reason: guard.reason },
    });
    return;
  }

  const ctx = buildContext(config, guard);
  const handler = handlers[config.domain as AutopilotDomain] ?? noopHandler;
  try {
    await handler(ctx);
  } catch (err) {
    console.error(`[Autopilot] handler error (org ${config.orgId}, ${config.domain}):`, err);
    await recordAutopilotActivity({
      orgId: config.orgId,
      domain: config.domain as AutopilotDomain,
      botId: null,
      action: "error",
      summary: `Autopilot handler threw an error: ${err instanceof Error ? err.message : "unknown error"}`,
      outcome: "error",
    });
  }
}

/** One evaluation pass over all enabled configs. Exported for tests/manual runs. */
export async function runAutopilotTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const enabled = await db.select().from(autopilotConfigsTable).where(eq(autopilotConfigsTable.enabled, true));
    const tickTime = new Date();
    const now = tickTime.getTime();
    for (const config of enabled) {
      if (!AUTOPILOT_DOMAINS.includes(config.domain as AutopilotDomain)) continue;
      if (!cadenceElapsed(config, now)) continue;
      try {
        await runConfig(config, tickTime);
      } catch (err) {
        console.error(`[Autopilot] runConfig failed (org ${config.orgId}, ${config.domain}):`, err);
      }
    }
  } catch (err) {
    console.error("[Autopilot] tick failed:", err);
  } finally {
    ticking = false;
  }
}

/** Start the single recurring scheduler. Idempotent. */
export function startAutopilotScheduler(): void {
  if (schedulerInterval) return;
  // First pass shortly after boot, then every base tick.
  setTimeout(() => {
    void runAutopilotTick();
  }, 45_000);
  schedulerInterval = setInterval(() => {
    void runAutopilotTick();
  }, BASE_TICK_MS);
  console.log("[Autopilot] Scheduler started (base tick 60s).");
}

export function stopAutopilotScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
