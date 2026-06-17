import {
  db,
  botsTable,
  organizationsTable,
  usersTable,
  type AutopilotConfig,
  type Bot,
  type FeatureKey,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasFeature, isOwnerEmail } from "../plan";
import { getPowerStatus, burnAiCharge, ACTIVE_SLOT } from "../battery";

// Flat charge burned per autopilot AI action. Autopilot runs server-side AI on
// the org owner's behalf; the work is metered against the assigned BOT's battery.
export const AUTOPILOT_AI_COST_CENTS = 4;

// ─── Centralized autopilot guardrails ────────────────────────────────────────
// Every automated handler must clear these before acting. They mirror the gates
// the MANUAL paths already enforce, so autopilot can never do something a human
// in the same seat couldn't. A blocked check is recorded to the activity log by
// the caller (engine) instead of throwing.

export type GuardrailFailure =
  | { reason: "domain_disabled" }
  | { reason: "bot_unassigned" }
  | { reason: "bot_not_found" }
  | { reason: "bot_not_in_org" };

export interface GuardrailPass {
  bot: Bot;
  ownerId: string;
  ownerEmail: string | null;
  maxActions: number;
}

export type GuardrailResult =
  | ({ ok: true } & GuardrailPass)
  | ({ ok: false } & GuardrailFailure);

/**
 * Pre-flight a config before invoking its handler. Resolves the assigned bot and
 * the org owner (whose entitlement & API credit gate paid work), and computes
 * the per-tick action cap. Pure read — does NOT mutate or log.
 */
export async function evaluateConfigGuardrails(
  config: AutopilotConfig,
  defaultMaxActions: number
): Promise<GuardrailResult> {
  if (!config.enabled) return { ok: false, reason: "domain_disabled" };
  if (!config.botId) return { ok: false, reason: "bot_unassigned" };

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, config.botId));
  if (!bot) return { ok: false, reason: "bot_not_found" };
  // The assigned bot must belong to the org it is running. A bot whose org no
  // longer matches (re-assigned, org changed) is treated as unassigned.
  if (bot.orgId !== config.orgId) return { ok: false, reason: "bot_not_in_org" };

  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, config.orgId));
  const ownerId = org?.ownerUserId ?? bot.ownerId;
  let ownerEmail: string | null = null;
  if (ownerId) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ownerId));
    ownerEmail = u?.email ?? null;
  }

  const rawCap = config.maxActionsPerTick ?? defaultMaxActions;
  const maxActions = Math.min(Math.max(rawCap, 0), 100);

  return { ok: true, bot, ownerId, ownerEmail, maxActions };
}

/**
 * Entitlement gate for the org owner. Defaults to PRIME / `claw_bot`, but any
 * domain whose manual path gates on a different plan feature (e.g. telephony's
 * `phone_system`) passes that key so autopilot mirrors the same gate.
 */
export async function checkEntitlement(
  ownerId: string,
  ownerEmail: string | null,
  feature: FeatureKey = "claw_bot"
): Promise<boolean> {
  if (!ownerId) return false;
  try {
    return await hasFeature(ownerId, ownerEmail, feature);
  } catch (err) {
    console.error("[Autopilot] entitlement check failed:", err);
    return false;
  }
}

/**
 * Battery preflight for any PAID AI action an autopilot handler runs. The work
 * is metered against the assigned BOT's installed battery (the bot is the
 * electrical thing doing the work). Owners are exempt. A depleted/uninstalled
 * battery blocks the action. On a successful preflight the flat AI cost is
 * burned (fire-and-forget). DB errors fall back to ALLOW so a transient blip
 * can't silently freeze a paid customer's automation.
 */
export async function checkCredit(
  ownerId: string,
  ownerEmail: string | null,
  botId: number | null,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!ownerId) return { allowed: false, reason: "no_owner" };
  if (isOwnerEmail(ownerEmail ?? undefined)) return { allowed: true };
  if (!botId) return { allowed: false, reason: "bot_unassigned" };
  try {
    const power = await getPowerStatus(ownerId, ACTIVE_SLOT, "bot", String(botId));
    if (!power.powered) return { allowed: false, reason: "bot_battery_depleted" };
    void burnAiCharge({
      userId: ownerId,
      targetType: "bot",
      targetId: String(botId),
      kind: "bot",
      label: "autopilot ai action",
      costBasisCents: AUTOPILOT_AI_COST_CENTS,
    }).catch((e) => console.error("[Autopilot] bot battery burn failed:", e?.message || e));
    return { allowed: true };
  } catch (err) {
    console.error("[Autopilot] credit preflight failed:", err);
    return { allowed: true, reason: "credit_check_error" };
  }
}
