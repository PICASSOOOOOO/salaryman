import { describe, it, expect } from "vitest";
import {
  sanitizeCrmPrefs,
  readCrmPrefs,
  isCrmLeadStatus,
  resolveCrmLeadStatuses,
} from "../lib/autopilot/crm-prefs";
import {
  AUTOPILOT_CRM_LEAD_STATUSES,
  AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
  AUTOPILOT_MIN_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUPS_PER_TICK,
} from "@workspace/db";

// These pure helpers gate which leads the CRM autopilot bot works and how often,
// so any garbage stored in autopilot_configs.prefs (or a malicious PUT body) must
// degrade to today's safe defaults — all in-play stages, 24h cooldown.

describe("sanitizeCrmPrefs", () => {
  const DEFAULTS = {
    leadStatuses: [],
    followUpIntervalHours: AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
    maxFollowUpsPerTick: 0,
  };

  it("returns fully-defaulted prefs for empty / non-object input", () => {
    expect(sanitizeCrmPrefs(undefined)).toEqual(DEFAULTS);
    expect(sanitizeCrmPrefs(null)).toEqual(DEFAULTS);
    expect(sanitizeCrmPrefs("nope")).toEqual(DEFAULTS);
    expect(sanitizeCrmPrefs(42)).toEqual(DEFAULTS);
    expect(sanitizeCrmPrefs({})).toEqual(DEFAULTS);
  });

  it("keeps only known lead statuses and de-dupes them", () => {
    const out = sanitizeCrmPrefs({
      leadStatuses: ["new", "contacted", "new", "won", 7, null, "qualified"],
    });
    expect(out.leadStatuses).toEqual(["new", "contacted", "qualified"]);
  });

  it("clamps followUpIntervalHours into [min, max]", () => {
    expect(sanitizeCrmPrefs({ followUpIntervalHours: 0 }).followUpIntervalHours).toBe(AUTOPILOT_MIN_FOLLOWUP_HOURS);
    expect(sanitizeCrmPrefs({ followUpIntervalHours: 99999 }).followUpIntervalHours).toBe(AUTOPILOT_MAX_FOLLOWUP_HOURS);
    expect(sanitizeCrmPrefs({ followUpIntervalHours: 48 }).followUpIntervalHours).toBe(48);
    expect(sanitizeCrmPrefs({ followUpIntervalHours: "bad" }).followUpIntervalHours).toBe(AUTOPILOT_DEFAULT_FOLLOWUP_HOURS);
  });

  it("clamps maxFollowUpsPerTick into [0, max], defaulting to 0", () => {
    expect(sanitizeCrmPrefs({ maxFollowUpsPerTick: -3 }).maxFollowUpsPerTick).toBe(0);
    expect(sanitizeCrmPrefs({ maxFollowUpsPerTick: 999 }).maxFollowUpsPerTick).toBe(AUTOPILOT_MAX_FOLLOWUPS_PER_TICK);
    expect(sanitizeCrmPrefs({ maxFollowUpsPerTick: 5 }).maxFollowUpsPerTick).toBe(5);
  });

  it("readCrmPrefs is sanitizeCrmPrefs over a stored jsonb blob", () => {
    expect(readCrmPrefs({ leadStatuses: ["proposal"], followUpIntervalHours: 12, maxFollowUpsPerTick: 4 })).toEqual({
      leadStatuses: ["proposal"],
      followUpIntervalHours: 12,
      maxFollowUpsPerTick: 4,
    });
  });
});

describe("isCrmLeadStatus", () => {
  it("accepts known in-play statuses and rejects everything else", () => {
    for (const s of AUTOPILOT_CRM_LEAD_STATUSES) expect(isCrmLeadStatus(s)).toBe(true);
    expect(isCrmLeadStatus("won")).toBe(false);
    expect(isCrmLeadStatus("lost")).toBe(false);
    expect(isCrmLeadStatus(5)).toBe(false);
    expect(isCrmLeadStatus(null)).toBe(false);
  });
});

describe("resolveCrmLeadStatuses", () => {
  it("uses the owner's allow-list when it has valid statuses", () => {
    expect(resolveCrmLeadStatuses(["contacted", "qualified"])).toEqual(["contacted", "qualified"]);
  });

  it("drops invalid statuses from the allow-list", () => {
    expect(resolveCrmLeadStatuses(["contacted", "won", "garbage"])).toEqual(["contacted"]);
  });

  it("falls back to ALL in-play statuses when the allow-list is empty or all-invalid", () => {
    expect(resolveCrmLeadStatuses([])).toEqual([...AUTOPILOT_CRM_LEAD_STATUSES]);
    expect(resolveCrmLeadStatuses(["won", "lost"])).toEqual([...AUTOPILOT_CRM_LEAD_STATUSES]);
  });
});
