import {
  db,
  autopilotConfigsTable,
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
  type AutopilotConfig,
  type AutopilotDomain,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordAutopilotActivity } from "./activity";
import { evaluateConfigGuardrails, checkEntitlement, checkCredit } from "./guardrails";
import type { AutopilotContext, AutopilotHandler, AutopilotLogInput } from "./types";

// ─── Autopilot engine ────────────────────────────────────────────────────────
// A SINGLE server-side recurring scheduler. Each base tick it finds orgs with an
// enabled domain + assigned bot whose cadence has elapsed, clears the shared
// guardrails, and invokes that domain's registered handler. Handlers are no-ops
// in this foundation task; the four dependent tasks register the real behavior
// via `registerAutopilotHandler`.

// ── Handler registry ─────────────────────────────────────────────────────────
const noopHandler: AutopilotHandler = async (ctx) => {
  // Foundation placeholder. The dependent domain task replaces this by calling
  // registerAutopilotHandler(<domain>, realHandler). Recording a noop keeps the
  // activity feed honest: it shows the autopilot is alive but not yet acting.
  await ctx.log({
    action: "tick",
    summary: `${ctx.domain} autopilot ran — no automated behavior implemented yet.`,
    outcome: "noop",
  });
};

const handlers: Record<AutopilotDomain, AutopilotHandler> = {
  business_ops: noopHandler,
  marketing: noopHandler,
  crm_calls: noopHandler,
  accounting: noopHandler,
};

/** Register the real handler for a domain (called by the dependent tasks). */
export function registerAutopilotHandler(domain: AutopilotDomain, handler: AutopilotHandler): void {
  handlers[domain] = handler;
}

// ── Tick scheduling ──────────────────────────────────────────────────────────
const BASE_TICK_MS = 60_000; // evaluate every minute; per-config cadence gates actual runs
let schedulerInterval: NodeJS.Timeout | null = null;
let ticking = false; // reentrancy guard: never overlap two evaluation passes

function cadenceElapsed(config: AutopilotConfig, now: number): boolean {
  if (!config.lastRunAt) return true;
  const cadenceMin = config.cadenceMinutes ?? AUTOPILOT_DEFAULT_CADENCE_MINUTES;
  const dueAt = new Date(config.lastRunAt).getTime() + cadenceMin * 60_000;
  return now >= dueAt;
}

/** Build the per-run context handed to a domain handler. */
function buildContext(
  config: AutopilotConfig,
  pass: { bot: AutopilotContext["bot"]; ownerId: string; ownerEmail: string | null; maxActions: number }
): AutopilotContext {
  const domain = config.domain as AutopilotDomain;
  let actionsUsed = 0;

  const log = (input: AutopilotLogInput) =>
    recordAutopilotActivity({
      orgId: config.orgId,
      domain,
      botId: config.botId,
      action: input.action,
      summary: input.summary,
      outcome: input.outcome,
      detail: input.detail,
    });

  const ctx: AutopilotContext = {
    orgId: config.orgId,
    domain,
    config,
    bot: pass.bot,
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
      const r = await checkCredit(pass.ownerId, pass.ownerEmail, pass.bot?.id ?? null);
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

/** Process one config: guardrails → handler. Marks lastRunAt before invoking. */
async function runConfig(config: AutopilotConfig): Promise<void> {
  const guard = await evaluateConfigGuardrails(config, AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK);

  // Claim the slot up front so a slow/failing handler can't double-run next tick.
  await db.update(autopilotConfigsTable).set({ lastRunAt: new Date() }).where(eq(autopilotConfigsTable.id, config.id));

  if (!guard.ok) {
    // bot_unassigned is the normal "enabled but no bot picked" state — stay quiet
    // to avoid spamming the feed every cadence.
    if (guard.reason === "bot_unassigned") return;
    await recordAutopilotActivity({
      orgId: config.orgId,
      domain: config.domain as AutopilotDomain,
      botId: config.botId,
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
      botId: config.botId,
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
    const now = Date.now();
    for (const config of enabled) {
      if (!AUTOPILOT_DOMAINS.includes(config.domain as AutopilotDomain)) continue;
      if (!cadenceElapsed(config, now)) continue;
      try {
        await runConfig(config);
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
