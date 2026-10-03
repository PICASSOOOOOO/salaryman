import {
  db,
  organizationsTable,
  usersTable,
  type AutopilotConfig,
  type FeatureKey,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasFeature, isOwnerEmail } from "../plan";
import { getPowerStatus, burnAiCharge, ACTIVE_SLOT, ASSISTANT_TARGET_ID } from "../battery";

// Flat charge burned per autopilot AI action. Autopilot runs server-side AI on
// the org owner's behalf; the work is metered against Pablo's assistant battery.
export const AUTOPILOT_AI_COST_CENTS = 4;

// ─── Centralized autopilot guardrails ────────────────────────────────────────
// Every automated handler must clear these before acting. They mirror the gates
// the MANUAL paths already enforce, so autopilot can never do something a human
// in the same seat couldn't. A blocked check is recorded to the activity log by
// the caller (engine) instead of throwing.

export type GuardrailFailure =
  | { reason: "domain_disabled" }
  | { reason: "org_not_found" }
  | { reason: "org_owner_missing" }
  | { reason: "pablo_prime_required" };

export interface GuardrailPass {
  ownerId: string;
  ownerEmail: string | null;
  maxActions: number;
}

export type GuardrailResult =
  | ({ ok: true } & GuardrailPass)
  | ({ ok: false } & GuardrailFailure);

/**
 * Pre-flight a config before invoking its handler. Resolves the org owner,
 * requires the paid Pablo Prime automation entitlement for every scheduled
 * domain, and computes the per-tick action cap. Paid AI actions separately use
 * the assistant battery. Legacy config.botId values are deliberately ignored.
 * Pure read — does NOT mutate or log.
 */
export async function evaluateConfigGuardrails(
  config: AutopilotConfig,
  defaultMaxActions: number
): Promise<GuardrailResult> {
  if (!config.enabled) return { ok: false, reason: "domain_disabled" };
  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, config.orgId));
  if (!org) return { ok: false, reason: "org_not_found" };
  if (!org.ownerUserId) return { ok: false, reason: "org_owner_missing" };

  const ownerId = org.ownerUserId;
  let ownerEmail: string | null = null;
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ownerId));
  ownerEmail = u?.email ?? null;

  // The automation subscription gates the whole scheduled feature, including
  // domains whose underlying manual actions are otherwise available for free.
  // This prevents enabled configs from continuing to run after PRIME access ends.
  if (!(await checkEntitlement(ownerId, ownerEmail, "claw_bot"))) {
    return { ok: false, reason: "pablo_prime_required" };
  }

  const rawCap = config.maxActionsPerTick ?? defaultMaxActions;
  const maxActions = Math.min(Math.max(rawCap, 0), 100);

  return { ok: true, ownerId, ownerEmail, maxActions };
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
 * is metered against the org owner's Pablo assistant battery. Owners are
 * exempt. A depleted/uninstalled battery blocks the action. On a successful
 * preflight the flat AI cost is burned (fire-and-forget), with the assistant's
 * existing one-time starter-cell behavior. DB errors fall back to ALLOW so a
 * transient blip can't silently freeze a paid customer's automation.
 */
export async function checkCredit(
  ownerId: string,
  ownerEmail: string | null,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!ownerId) return { allowed: false, reason: "no_owner" };
  if (isOwnerEmail(ownerEmail ?? undefined)) return { allowed: true };
  try {
    const power = await getPowerStatus(ownerId, ACTIVE_SLOT, "assistant", ASSISTANT_TARGET_ID);
    if (!power.powered) return { allowed: false, reason: "assistant_battery_depleted" };
    void burnAiCharge({
      userId: ownerId,
      targetType: "assistant",
      targetId: ASSISTANT_TARGET_ID,
      kind: "chat",
      label: "pablo automation ai action",
      costBasisCents: AUTOPILOT_AI_COST_CENTS,
      allowSeed: true,
    }).catch((e) => console.error("[Autopilot] assistant battery burn failed:", e?.message || e));
    return { allowed: true };
  } catch (err) {
    console.error("[Autopilot] credit preflight failed:", err);
    return { allowed: true, reason: "credit_check_error" };
  }
}
