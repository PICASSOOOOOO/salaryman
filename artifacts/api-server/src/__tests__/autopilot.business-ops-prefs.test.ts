import { describe, it, expect } from "vitest";
import {
  sanitizeBusinessOpsPrefs,
  readBusinessOpsPrefs,
} from "../lib/autopilot/business-ops-prefs";
import {
  AUTOPILOT_DEFAULT_STAFF_TARGET,
  AUTOPILOT_MAX_STAFF_TARGET,
  AUTOPILOT_DEFAULT_TASKS_PER_TICK,
  AUTOPILOT_MAX_TASKS_PER_TICK,
  AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
} from "@workspace/db";

// These pure helpers gate what the Business Ops autopilot bot actually does, so
// any garbage stored in autopilot_configs.prefs (or a malicious PUT body) must
// degrade to today's safe defaults — never crash the handler.

describe("sanitizeBusinessOpsPrefs", () => {
  const DEFAULTS = {
    staffTarget: AUTOPILOT_DEFAULT_STAFF_TARGET,
    tasksPerTick: AUTOPILOT_DEFAULT_TASKS_PER_TICK,
    closeStaleTimeEntries: true,
    postAnnouncements: true,
    announcementIntervalHours: AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
  };

  it("returns fully-defaulted prefs for empty / non-object input", () => {
    expect(sanitizeBusinessOpsPrefs(undefined)).toEqual(DEFAULTS);
    expect(sanitizeBusinessOpsPrefs(null)).toEqual(DEFAULTS);
    expect(sanitizeBusinessOpsPrefs("nope")).toEqual(DEFAULTS);
    expect(sanitizeBusinessOpsPrefs(42)).toEqual(DEFAULTS);
    expect(sanitizeBusinessOpsPrefs({})).toEqual(DEFAULTS);
  });

  it("clamps staffTarget into [0, max] and rounds", () => {
    expect(sanitizeBusinessOpsPrefs({ staffTarget: -5 }).staffTarget).toBe(0);
    expect(sanitizeBusinessOpsPrefs({ staffTarget: 1000 }).staffTarget).toBe(AUTOPILOT_MAX_STAFF_TARGET);
    expect(sanitizeBusinessOpsPrefs({ staffTarget: 3.7 }).staffTarget).toBe(4);
    expect(sanitizeBusinessOpsPrefs({ staffTarget: "8" }).staffTarget).toBe(8);
    expect(sanitizeBusinessOpsPrefs({ staffTarget: "abc" }).staffTarget).toBe(AUTOPILOT_DEFAULT_STAFF_TARGET);
  });

  it("clamps tasksPerTick into [1, max]", () => {
    expect(sanitizeBusinessOpsPrefs({ tasksPerTick: 0 }).tasksPerTick).toBe(1);
    expect(sanitizeBusinessOpsPrefs({ tasksPerTick: 999 }).tasksPerTick).toBe(AUTOPILOT_MAX_TASKS_PER_TICK);
    expect(sanitizeBusinessOpsPrefs({ tasksPerTick: 5 }).tasksPerTick).toBe(5);
  });

  it("coerces the toggles to booleans, defaulting ON for non-booleans", () => {
    expect(sanitizeBusinessOpsPrefs({ closeStaleTimeEntries: false }).closeStaleTimeEntries).toBe(false);
    expect(sanitizeBusinessOpsPrefs({ postAnnouncements: false }).postAnnouncements).toBe(false);
    expect(sanitizeBusinessOpsPrefs({ closeStaleTimeEntries: "yes" }).closeStaleTimeEntries).toBe(true);
    expect(sanitizeBusinessOpsPrefs({ postAnnouncements: 1 }).postAnnouncements).toBe(true);
  });

  it("clamps announcementIntervalHours into [min, max] and rounds", () => {
    expect(sanitizeBusinessOpsPrefs({ announcementIntervalHours: 0 }).announcementIntervalHours).toBe(
      AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS,
    );
    expect(sanitizeBusinessOpsPrefs({ announcementIntervalHours: 99999 }).announcementIntervalHours).toBe(
      AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
    );
    expect(sanitizeBusinessOpsPrefs({ announcementIntervalHours: 12.4 }).announcementIntervalHours).toBe(12);
    expect(sanitizeBusinessOpsPrefs({ announcementIntervalHours: "24" }).announcementIntervalHours).toBe(24);
    expect(sanitizeBusinessOpsPrefs({ announcementIntervalHours: "abc" }).announcementIntervalHours).toBe(
      AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
    );
  });

  it("readBusinessOpsPrefs is sanitizeBusinessOpsPrefs over a stored jsonb blob", () => {
    expect(
      readBusinessOpsPrefs({
        staffTarget: 7,
        tasksPerTick: 3,
        closeStaleTimeEntries: false,
        postAnnouncements: false,
        announcementIntervalHours: 12,
      }),
    ).toEqual({
      staffTarget: 7,
      tasksPerTick: 3,
      closeStaleTimeEntries: false,
      postAnnouncements: false,
      announcementIntervalHours: 12,
    });
  });
});
