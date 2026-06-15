import {
  db,
  botsTable,
  organizationsTable,
  usersTable,
  type AutopilotConfig,
  type Bot,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasFeature } from "../plan";
import { canUseApiFeatures } from "../pablo-tax";

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

/** Entitlement gate (PRIME / claw_bot) for the org owner. */
export async function checkEntitlement(
  ownerId: string,
  ownerEmail: string | null,
  feature: "claw_bot" = "claw_bot"
): Promise<boolean> {
  if (!ownerId) return false;
  try {
    return await hasFeature(ownerId, ownerEmail, feature);
  } catch (err) {
    console.error("[Autopilot] entitlement check failed:", err);
    return false;
  }
}

/** Pablo-Tax / credit preflight for the org owner before any PAID AI call. */
export async function checkCredit(ownerId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!ownerId) return { allowed: false, reason: "no_owner" };
  try {
    const r = await canUseApiFeatures(ownerId);
    return { allowed: r.allowed, reason: r.reason };
  } catch (err) {
    console.error("[Autopilot] credit preflight failed:", err);
    return { allowed: false, reason: "credit_check_error" };
  }
}
