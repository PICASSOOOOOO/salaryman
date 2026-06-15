import {
  AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
  type AccountingAutopilotPrefs,
} from "@workspace/db";
import { clampIntPref, readBoolPref } from "./prefs-utils";

// ─── Accounting autopilot preferences ────────────────────────────────────────
// Pure helpers (unit-tested) that normalize the owner-set Accounting prefs
// stored in autopilot_configs.prefs. The route sanitizes before writing and the
// handler reads through the same shape, so any garbage in the jsonb degrades to
// today's defaults (all three CFO duties ON at their default cadences).

/**
 * Coerce arbitrary input into a valid, fully-defaulted AccountingAutopilotPrefs:
 *   • collections / billPayments / payroll — booleans toggling each duty (default ON)
 *   • reminderCooldownDays                 — clamped collections re-chase window
 *   • payrollPeriodDays                    — clamped min days between payroll runs
 */
export function sanitizeAccountingPrefs(raw: unknown): AccountingAutopilotPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    collections: readBoolPref(obj.collections, true),
    billPayments: readBoolPref(obj.billPayments, true),
    payroll: readBoolPref(obj.payroll, true),
    reminderCooldownDays: clampIntPref(
      obj.reminderCooldownDays,
      1,
      AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
      AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
    ),
    payrollPeriodDays: clampIntPref(
      obj.payrollPeriodDays,
      AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS,
      AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
      AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
    ),
  };
}

/** Read normalized Accounting prefs from a stored config's `prefs` jsonb. */
export function readAccountingPrefs(prefs: unknown): AccountingAutopilotPrefs {
  return sanitizeAccountingPrefs(prefs);
}
