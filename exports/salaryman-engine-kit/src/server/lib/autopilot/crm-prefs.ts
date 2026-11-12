import {
  AUTOPILOT_CRM_LEAD_STATUSES,
  AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
  AUTOPILOT_MIN_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUPS_PER_TICK,
  type CrmAutopilotPrefs,
} from "@workspace/db";
import { clampIntPref } from "./prefs-utils";

// ─── CRM & Calls autopilot preferences ───────────────────────────────────────
// Pure helpers (unit-tested) that normalize the owner-set CRM prefs stored in
// autopilot_configs.prefs. The route sanitizes before writing and the handler
// reads through the same shape, so any garbage in the jsonb degrades to today's
// defaults (all active stages, a 24h cooldown, action-cap-only throughput).

const LEAD_STATUSES = AUTOPILOT_CRM_LEAD_STATUSES as readonly string[];

/** True when `s` is one of the workable (in-play) lead pipeline statuses. */
export function isCrmLeadStatus(s: unknown): s is string {
  return typeof s === "string" && LEAD_STATUSES.includes(s);
}

/**
 * Coerce arbitrary input into a valid, fully-defaulted CrmAutopilotPrefs:
 *   • leadStatuses          — only known in-play statuses, de-duped (empty = all)
 *   • followUpIntervalHours — clamped per-lead cooldown in hours
 *   • maxFollowUpsPerTick   — clamped per-tick lead cap (0 = action-cap only)
 */
export function sanitizeCrmPrefs(raw: unknown): CrmAutopilotPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const leadStatuses = Array.isArray(obj.leadStatuses)
    ? Array.from(new Set(obj.leadStatuses.filter(isCrmLeadStatus)))
    : [];
  return {
    leadStatuses,
    followUpIntervalHours: clampIntPref(
      obj.followUpIntervalHours,
      AUTOPILOT_MIN_FOLLOWUP_HOURS,
      AUTOPILOT_MAX_FOLLOWUP_HOURS,
      AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
    ),
    maxFollowUpsPerTick: clampIntPref(obj.maxFollowUpsPerTick, 0, AUTOPILOT_MAX_FOLLOWUPS_PER_TICK, 0),
  };
}

/** Read normalized CRM prefs from a stored config's `prefs` jsonb. */
export function readCrmPrefs(prefs: unknown): CrmAutopilotPrefs {
  return sanitizeCrmPrefs(prefs);
}

/**
 * Resolve which lead statuses the bot may work this tick: the owner's allow-list
 * when set, otherwise all in-play statuses (today's behavior).
 */
export function resolveCrmLeadStatuses(allowed: string[]): string[] {
  const valid = allowed.filter(isCrmLeadStatus);
  return valid.length > 0 ? valid : [...LEAD_STATUSES];
}
