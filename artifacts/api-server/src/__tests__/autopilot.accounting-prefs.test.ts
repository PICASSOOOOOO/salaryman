import { describe, it, expect } from "vitest";
import {
  sanitizeAccountingPrefs,
  readAccountingPrefs,
} from "../lib/autopilot/accounting-prefs";
import {
  AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
} from "@workspace/db";

// These pure helpers gate which CFO duties the Accounting autopilot bot runs and
// their cadences, so any garbage stored in autopilot_configs.prefs (or a
// malicious PUT body) must degrade to today's safe defaults — all three duties ON.

describe("sanitizeAccountingPrefs", () => {
  const DEFAULTS = {
    collections: true,
    billPayments: true,
    payroll: true,
    reminderCooldownDays: AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
    payrollPeriodDays: AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
  };

  it("returns fully-defaulted prefs for empty / non-object input", () => {
    expect(sanitizeAccountingPrefs(undefined)).toEqual(DEFAULTS);
    expect(sanitizeAccountingPrefs(null)).toEqual(DEFAULTS);
    expect(sanitizeAccountingPrefs("nope")).toEqual(DEFAULTS);
    expect(sanitizeAccountingPrefs(42)).toEqual(DEFAULTS);
    expect(sanitizeAccountingPrefs({})).toEqual(DEFAULTS);
  });

  it("coerces each duty toggle to a boolean, defaulting ON for non-booleans", () => {
    expect(sanitizeAccountingPrefs({ collections: false }).collections).toBe(false);
    expect(sanitizeAccountingPrefs({ billPayments: false }).billPayments).toBe(false);
    expect(sanitizeAccountingPrefs({ payroll: false }).payroll).toBe(false);
    expect(sanitizeAccountingPrefs({ collections: "no" }).collections).toBe(true);
    expect(sanitizeAccountingPrefs({ payroll: 0 }).payroll).toBe(true);
  });

  it("clamps reminderCooldownDays into [1, max]", () => {
    expect(sanitizeAccountingPrefs({ reminderCooldownDays: 0 }).reminderCooldownDays).toBe(1);
    expect(sanitizeAccountingPrefs({ reminderCooldownDays: 9999 }).reminderCooldownDays).toBe(
      AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
    );
    expect(sanitizeAccountingPrefs({ reminderCooldownDays: 7 }).reminderCooldownDays).toBe(7);
    expect(sanitizeAccountingPrefs({ reminderCooldownDays: "x" }).reminderCooldownDays).toBe(
      AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
    );
  });

  it("clamps payrollPeriodDays into [min, max]", () => {
    expect(sanitizeAccountingPrefs({ payrollPeriodDays: 1 }).payrollPeriodDays).toBe(AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS);
    expect(sanitizeAccountingPrefs({ payrollPeriodDays: 9999 }).payrollPeriodDays).toBe(
      AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
    );
    expect(sanitizeAccountingPrefs({ payrollPeriodDays: 30 }).payrollPeriodDays).toBe(30);
  });

  it("readAccountingPrefs is sanitizeAccountingPrefs over a stored jsonb blob", () => {
    expect(
      readAccountingPrefs({
        collections: false,
        billPayments: true,
        payroll: false,
        reminderCooldownDays: 5,
        payrollPeriodDays: 14,
      }),
    ).toEqual({
      collections: false,
      billPayments: true,
      payroll: false,
      reminderCooldownDays: 5,
      payrollPeriodDays: 14,
    });
  });
});
