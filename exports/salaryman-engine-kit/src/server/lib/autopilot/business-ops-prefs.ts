import {
  AUTOPILOT_DEFAULT_STAFF_TARGET,
  AUTOPILOT_MAX_STAFF_TARGET,
  AUTOPILOT_DEFAULT_TASKS_PER_TICK,
  AUTOPILOT_MAX_TASKS_PER_TICK,
  AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
  type BusinessOpsAutopilotPrefs,
} from "@workspace/db";
import { clampIntPref, readBoolPref } from "./prefs-utils";

// ─── Business Ops autopilot preferences ──────────────────────────────────────
// Pure helpers (unit-tested) that normalize the owner-set Business Ops prefs
// stored in autopilot_configs.prefs. The route sanitizes before writing and the
// handler reads through the same shape, so what an owner sets is exactly what
// the bot uses — and any garbage in the jsonb degrades to today's defaults.

/**
 * Coerce arbitrary input into a valid, fully-defaulted BusinessOpsAutopilotPrefs:
 *   • staffTarget           — clamped headcount floor (0 disables the fallback hire)
 *   • tasksPerTick          — clamped count of board tasks advanced per tick
 *   • closeStaleTimeEntries — boolean, default ON
 *   • postAnnouncements     — boolean, default ON
 *   • announcementIntervalHours — clamped hours between routine announcements
 */
export function sanitizeBusinessOpsPrefs(raw: unknown): BusinessOpsAutopilotPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    staffTarget: clampIntPref(obj.staffTarget, 0, AUTOPILOT_MAX_STAFF_TARGET, AUTOPILOT_DEFAULT_STAFF_TARGET),
    tasksPerTick: clampIntPref(obj.tasksPerTick, 1, AUTOPILOT_MAX_TASKS_PER_TICK, AUTOPILOT_DEFAULT_TASKS_PER_TICK),
    closeStaleTimeEntries: readBoolPref(obj.closeStaleTimeEntries, true),
    postAnnouncements: readBoolPref(obj.postAnnouncements, true),
    announcementIntervalHours: clampIntPref(
      obj.announcementIntervalHours,
      AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS,
      AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
      AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS
    ),
  };
}

/** Read normalized Business Ops prefs from a stored config's `prefs` jsonb. */
export function readBusinessOpsPrefs(prefs: unknown): BusinessOpsAutopilotPrefs {
  return sanitizeBusinessOpsPrefs(prefs);
}
