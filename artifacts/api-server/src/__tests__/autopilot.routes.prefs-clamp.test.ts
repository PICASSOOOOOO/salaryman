import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  AUTOPILOT_DEFAULT_STAFF_TARGET,
  AUTOPILOT_MAX_STAFF_TARGET,
  AUTOPILOT_DEFAULT_TASKS_PER_TICK,
  AUTOPILOT_MAX_TASKS_PER_TICK,
  AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
  AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
  AUTOPILOT_MIN_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUP_HOURS,
  AUTOPILOT_MAX_FOLLOWUPS_PER_TICK,
  AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
  AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS,
  AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
} from "@workspace/db";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrg,
  getStoredConfig,
  cleanupTestData,
} from "./helpers/autopilotTestApp";

// Server-side guard coverage for the *numeric prefs* on PUT /api/autopilot/:domain.
// Task #601 added front-end clamping for these fields on the dashboard, but the
// server is the real guard: a client that bypasses the UI (or a future UI
// regression) could still PUT out-of-range, fractional, or non-numeric values.
// These tests pin that the route's per-domain prefs sanitizers clamp/round/
// default exactly to the ranges the UI enforces, so garbage never lands in the
// autopilot_configs.prefs jsonb.
//
// Ranges mirrored from artifacts/interview-helper/src/pages/Autopilot.tsx:
//   business_ops: staffTarget [0,100] d=5, tasksPerTick [1,20] d=2,
//                 announcementIntervalHours [1,168] d=6
//   crm_calls:    followUpIntervalHours [1,720] d=24, maxFollowUpsPerTick [0,50] d=0
//   accounting:   reminderCooldownDays [1,60] d=3, payrollPeriodDays [7,90] d=28

let app: Express;

beforeAll(() => {
  app = buildApp();
});
beforeEach(() => {
  setAuthed(true);
});
afterAll(async () => {
  await cleanupTestData();
});

describe("PUT /api/autopilot/business_ops — numeric prefs clamping", () => {
  it("clamps out-of-range numeric prefs (below min / above max) on the stored row", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/business_ops").send({
      prefs: { staffTarget: -10, tasksPerTick: 0, announcementIntervalHours: 0 },
    });

    expect(res.status).toBe(200);
    // Below min: staffTarget floors at 0, tasksPerTick at 1, interval at its min.
    expect(res.body.config.prefs.staffTarget).toBe(0);
    expect(res.body.config.prefs.tasksPerTick).toBe(1);
    expect(res.body.config.prefs.announcementIntervalHours).toBe(AUTOPILOT_MIN_ANNOUNCEMENT_INTERVAL_HOURS);

    const above = await request(app).put("/api/autopilot/business_ops").send({
      prefs: { staffTarget: 99999, tasksPerTick: 99999, announcementIntervalHours: 99999 },
    });
    expect(above.status).toBe(200);
    expect(above.body.config.prefs.staffTarget).toBe(AUTOPILOT_MAX_STAFF_TARGET);
    expect(above.body.config.prefs.tasksPerTick).toBe(AUTOPILOT_MAX_TASKS_PER_TICK);
    expect(above.body.config.prefs.announcementIntervalHours).toBe(AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS);

    const stored = await getStoredConfig(orgId, "business_ops");
    expect(stored?.prefs).toMatchObject({
      staffTarget: AUTOPILOT_MAX_STAFF_TARGET,
      tasksPerTick: AUTOPILOT_MAX_TASKS_PER_TICK,
      announcementIntervalHours: AUTOPILOT_MAX_ANNOUNCEMENT_INTERVAL_HOURS,
    });
  });

  it("rounds fractional numeric prefs to whole numbers", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/business_ops").send({
      prefs: { staffTarget: 7.8, tasksPerTick: 3.2, announcementIntervalHours: 12.5 },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.staffTarget).toBe(8);
    expect(res.body.config.prefs.tasksPerTick).toBe(3);
    expect(res.body.config.prefs.announcementIntervalHours).toBe(13);

    const stored = await getStoredConfig(orgId, "business_ops");
    expect(stored?.prefs).toMatchObject({ staffTarget: 8, tasksPerTick: 3, announcementIntervalHours: 13 });
  });

  it("degrades non-numeric / NaN numeric prefs to the domain defaults", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/business_ops").send({
      prefs: { staffTarget: "lots", tasksPerTick: null, announcementIntervalHours: "often" },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.staffTarget).toBe(AUTOPILOT_DEFAULT_STAFF_TARGET);
    expect(res.body.config.prefs.tasksPerTick).toBe(AUTOPILOT_DEFAULT_TASKS_PER_TICK);
    expect(res.body.config.prefs.announcementIntervalHours).toBe(AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS);

    const stored = await getStoredConfig(orgId, "business_ops");
    expect(stored?.prefs).toMatchObject({
      staffTarget: AUTOPILOT_DEFAULT_STAFF_TARGET,
      tasksPerTick: AUTOPILOT_DEFAULT_TASKS_PER_TICK,
      announcementIntervalHours: AUTOPILOT_DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS,
    });
  });
});

describe("PUT /api/autopilot/crm_calls — numeric prefs clamping", () => {
  it("clamps out-of-range numeric prefs (below min / above max) on the stored row", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const below = await request(app).put("/api/autopilot/crm_calls").send({
      prefs: { followUpIntervalHours: 0, maxFollowUpsPerTick: -5 },
    });
    expect(below.status).toBe(200);
    expect(below.body.config.prefs.followUpIntervalHours).toBe(AUTOPILOT_MIN_FOLLOWUP_HOURS);
    expect(below.body.config.prefs.maxFollowUpsPerTick).toBe(0);

    const above = await request(app).put("/api/autopilot/crm_calls").send({
      prefs: { followUpIntervalHours: 99999, maxFollowUpsPerTick: 99999 },
    });
    expect(above.status).toBe(200);
    expect(above.body.config.prefs.followUpIntervalHours).toBe(AUTOPILOT_MAX_FOLLOWUP_HOURS);
    expect(above.body.config.prefs.maxFollowUpsPerTick).toBe(AUTOPILOT_MAX_FOLLOWUPS_PER_TICK);

    const stored = await getStoredConfig(orgId, "crm_calls");
    expect(stored?.prefs).toMatchObject({
      followUpIntervalHours: AUTOPILOT_MAX_FOLLOWUP_HOURS,
      maxFollowUpsPerTick: AUTOPILOT_MAX_FOLLOWUPS_PER_TICK,
    });
  });

  it("rounds fractional numeric prefs to whole numbers", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/crm_calls").send({
      prefs: { followUpIntervalHours: 36.4, maxFollowUpsPerTick: 9.9 },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.followUpIntervalHours).toBe(36);
    expect(res.body.config.prefs.maxFollowUpsPerTick).toBe(10);

    const stored = await getStoredConfig(orgId, "crm_calls");
    expect(stored?.prefs).toMatchObject({ followUpIntervalHours: 36, maxFollowUpsPerTick: 10 });
  });

  it("degrades non-numeric / NaN numeric prefs to the domain defaults", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/crm_calls").send({
      prefs: { followUpIntervalHours: "soon", maxFollowUpsPerTick: "many" },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.followUpIntervalHours).toBe(AUTOPILOT_DEFAULT_FOLLOWUP_HOURS);
    expect(res.body.config.prefs.maxFollowUpsPerTick).toBe(0);

    const stored = await getStoredConfig(orgId, "crm_calls");
    expect(stored?.prefs).toMatchObject({
      followUpIntervalHours: AUTOPILOT_DEFAULT_FOLLOWUP_HOURS,
      maxFollowUpsPerTick: 0,
    });
  });
});

describe("PUT /api/autopilot/accounting — numeric prefs clamping", () => {
  it("clamps out-of-range numeric prefs (below min / above max) on the stored row", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const below = await request(app).put("/api/autopilot/accounting").send({
      prefs: { reminderCooldownDays: 0, payrollPeriodDays: 0 },
    });
    expect(below.status).toBe(200);
    expect(below.body.config.prefs.reminderCooldownDays).toBe(1);
    expect(below.body.config.prefs.payrollPeriodDays).toBe(AUTOPILOT_MIN_PAYROLL_PERIOD_DAYS);

    const above = await request(app).put("/api/autopilot/accounting").send({
      prefs: { reminderCooldownDays: 99999, payrollPeriodDays: 99999 },
    });
    expect(above.status).toBe(200);
    expect(above.body.config.prefs.reminderCooldownDays).toBe(AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS);
    expect(above.body.config.prefs.payrollPeriodDays).toBe(AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS);

    const stored = await getStoredConfig(orgId, "accounting");
    expect(stored?.prefs).toMatchObject({
      reminderCooldownDays: AUTOPILOT_MAX_REMINDER_COOLDOWN_DAYS,
      payrollPeriodDays: AUTOPILOT_MAX_PAYROLL_PERIOD_DAYS,
    });
  });

  it("rounds fractional numeric prefs to whole numbers", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/accounting").send({
      prefs: { reminderCooldownDays: 4.6, payrollPeriodDays: 30.2 },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.reminderCooldownDays).toBe(5);
    expect(res.body.config.prefs.payrollPeriodDays).toBe(30);

    const stored = await getStoredConfig(orgId, "accounting");
    expect(stored?.prefs).toMatchObject({ reminderCooldownDays: 5, payrollPeriodDays: 30 });
  });

  it("degrades non-numeric / NaN numeric prefs to the domain defaults", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/accounting").send({
      prefs: { reminderCooldownDays: "weekly", payrollPeriodDays: NaN },
    });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs.reminderCooldownDays).toBe(AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS);
    expect(res.body.config.prefs.payrollPeriodDays).toBe(AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS);

    const stored = await getStoredConfig(orgId, "accounting");
    expect(stored?.prefs).toMatchObject({
      reminderCooldownDays: AUTOPILOT_DEFAULT_REMINDER_COOLDOWN_DAYS,
      payrollPeriodDays: AUTOPILOT_DEFAULT_PAYROLL_PERIOD_DAYS,
    });
  });
});
