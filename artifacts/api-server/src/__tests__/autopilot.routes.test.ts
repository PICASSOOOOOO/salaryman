import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  db,
  autopilotActivityLogTable,
  AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES,
  AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES,
  AUTOPILOT_PRIME_AUTO_START_DOMAINS,
  AUTOPILOT_DEFAULT_MARKETING_TONE,
  AUTOPILOT_MAX_MARKETING_TOPICS,
  AUTOPILOT_MAX_MARKETING_TOPIC_LEN,
} from "@workspace/db";
import { sanitizeAccountingPrefs } from "../lib/autopilot/accounting-prefs";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrg,
  createWorkspaceProject,
  getStoredConfig,
  cleanupTestData,
} from "./helpers/autopilotTestApp";

// Integration coverage for PUT /api/autopilot/:domain — the path that merges an
// incoming partial over the stored prefs, sanitizes, and writes the jsonb. The
// pure sanitizer is unit-tested elsewhere; these tests pin the *route* that
// guards the database from a malicious/malformed save body and enforces the
// autopilot.manage org permission.

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

describe("PUT /api/autopilot/:domain — enabled on/off toggle", () => {
  it("turning a domain on creates the row with enabled:true", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // No row exists yet → OFF is today's default.
    expect(await getStoredConfig(orgId, "marketing")).toBeNull();

    const res = await request(app).put("/api/autopilot/marketing").send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(true);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(true);
  });

  it("turning a domain back off persists enabled:false", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const on = await request(app).put("/api/autopilot/marketing").send({ enabled: true });
    expect(on.body.config.enabled).toBe(true);

    const off = await request(app).put("/api/autopilot/marketing").send({ enabled: false });

    expect(off.status).toBe(200);
    expect(off.body.config.enabled).toBe(false);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(false);
  });

  it("toggling enabled alone preserves caps and prefs without a bot assignment", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Seed a fully-configured, enabled domain.
    await request(app).put("/api/autopilot/marketing").send({
      enabled: true,
      cadenceMinutes: 60,
      maxActionsPerTick: 10,
      budgetCapCents: 100000,
      prefs: { platforms: ["twitter"], tone: "bold", topics: ["Launch"] },
    });

    // Flip OFF without touching anything else.
    const res = await request(app).put("/api/autopilot/marketing").send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(false);
    expect(res.body.config.botId).toBeNull();
    expect(res.body.config.cadenceMinutes).toBe(60);
    expect(res.body.config.maxActionsPerTick).toBe(10);
    expect(res.body.config.budgetCapCents).toBe(100000);
    expect(res.body.config.prefs).toEqual({
      platforms: ["twitter"], tone: "bold", topics: ["Launch"], generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(false);
    expect(stored?.botId).toBeNull();
    expect(stored?.cadenceMinutes).toBe(60);
    expect(stored?.maxActionsPerTick).toBe(10);
    expect(stored?.budgetCapCents).toBe(100000);
    expect(stored?.prefs).toEqual({
      platforms: ["twitter"], tone: "bold", topics: ["Launch"],
      generateImages: false, imageGenerationApprovedBy: null,
    });
  });

  it("a save that omits enabled leaves the stored on/off state unchanged", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Turn it on, then send an unrelated patch with no `enabled` field.
    await request(app).put("/api/autopilot/marketing").send({ enabled: true });
    const res = await request(app).put("/api/autopilot/marketing").send({ cadenceMinutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(true);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(true);
  });

  it("coerces a truthy/falsy enabled value to a real boolean before storing", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Truthy non-boolean → true.
    const on = await request(app).put("/api/autopilot/marketing").send({ enabled: "yes" });
    expect(on.status).toBe(200);
    expect(on.body.config.enabled).toBe(true);
    expect((await getStoredConfig(orgId, "marketing"))?.enabled).toBe(true);

    // Falsy non-boolean → false.
    const off = await request(app).put("/api/autopilot/marketing").send({ enabled: 0 });
    expect(off.status).toBe(200);
    expect(off.body.config.enabled).toBe(false);
    expect((await getStoredConfig(orgId, "marketing"))?.enabled).toBe(false);
  });

  it("toggles a non-marketing domain on and off too", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const on = await request(app).put("/api/autopilot/accounting").send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.config.enabled).toBe(true);
    expect((await getStoredConfig(orgId, "accounting"))?.enabled).toBe(true);

    const off = await request(app).put("/api/autopilot/accounting").send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.config.enabled).toBe(false);
    expect((await getStoredConfig(orgId, "accounting"))?.enabled).toBe(false);
  });
});

describe("PUT /api/autopilot/:domain — marketing pref sanitization", () => {
  it("strips garbage prefs (unknown platforms, bad tone, oversized topics) before storing", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const longTopic = "x".repeat(AUTOPILOT_MAX_MARKETING_TOPIC_LEN + 50);
    const tooMany = Array.from({ length: AUTOPILOT_MAX_MARKETING_TOPICS + 5 }, (_, i) => `topic ${i}`);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({
        prefs: {
          platforms: ["twitter", "myspace", 7, null, "linkedin", "twitter"],
          tone: "sarcastic",
          topics: ["  Summer sale  ", "", "   ", longTopic, ...tooMany],
        },
      });

    expect(res.status).toBe(200);
    const prefs = res.body.config.prefs;
    expect(prefs.platforms).toEqual(["twitter", "linkedin"]);
    expect(prefs.tone).toBe(AUTOPILOT_DEFAULT_MARKETING_TONE);
    expect(prefs.generateImages).toBe(false);
    expect(prefs).not.toHaveProperty("imageGenerationApprovedBy");
    expect(prefs.topics[0]).toBe("Summer sale");
    expect(prefs.topics).toHaveLength(AUTOPILOT_MAX_MARKETING_TOPICS);
    expect(prefs.topics.every((t: string) => t.length > 0 && t.length <= AUTOPILOT_MAX_MARKETING_TOPIC_LEN)).toBe(true);

    // What landed in the database matches the sanitized response, not the raw body.
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({ ...prefs, imageGenerationApprovedBy: null });
  });

  it("keeps a valid allow-list, tone and topics intact", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["bluesky", "linkedin"], tone: "Playful", topics: [" Launch "] } });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs).toEqual({
      platforms: ["bluesky", "linkedin"],
      tone: "playful",
      topics: ["Launch"],
      generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({
      platforms: ["bluesky", "linkedin"], tone: "playful", topics: ["Launch"],
      generateImages: false, imageGenerationApprovedBy: null,
    });
  });
});

describe("PUT /api/autopilot/:domain — partial merge over stored prefs", () => {
  it("a tone-only update preserves previously-saved platforms and topics", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Seed full prefs.
    await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["twitter", "instagram"], tone: "bold", topics: ["Hiring", "Product"] } });

    // Patch tone only.
    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { tone: "witty" } });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs).toEqual({
      platforms: ["twitter", "instagram"],
      tone: "witty",
      topics: ["Hiring", "Product"],
      generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({
      platforms: ["twitter", "instagram"], tone: "witty", topics: ["Hiring", "Product"],
      generateImages: false, imageGenerationApprovedBy: null,
    });
  });

  it("a platforms-only update preserves the previously-saved tone and topics", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["twitter"], tone: "playful", topics: ["Sale"] } });

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["linkedin", "bluesky"] } });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs).toEqual({
      platforms: ["linkedin", "bluesky"],
      tone: "playful",
      topics: ["Sale"],
      generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");
  });
});

describe("PUT /api/autopilot/:domain — scheduling caps clamping", () => {
  it("clamps out-of-range caps to the min on the stored row", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: 0, maxActionsPerTick: 0, budgetCapCents: -500 });

    expect(res.status).toBe(200);
    expect(res.body.config.cadenceMinutes).toBe(5);
    expect(res.body.config.maxActionsPerTick).toBe(1);
    expect(res.body.config.budgetCapCents).toBe(0);

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.cadenceMinutes).toBe(5);
    expect(stored?.maxActionsPerTick).toBe(1);
    expect(stored?.budgetCapCents).toBe(0);
  });

  it("clamps out-of-range caps to the max on the stored row", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: 99999, maxActionsPerTick: 1000000, budgetCapCents: 999999999 });

    expect(res.status).toBe(200);
    expect(res.body.config.cadenceMinutes).toBe(1440);
    expect(res.body.config.maxActionsPerTick).toBe(100);
    expect(res.body.config.budgetCapCents).toBe(10_000_000);

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.cadenceMinutes).toBe(1440);
    expect(stored?.maxActionsPerTick).toBe(100);
    expect(stored?.budgetCapCents).toBe(10_000_000);
  });

  it("rounds and keeps in-range caps as given", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: 30.7, maxActionsPerTick: 12.2, budgetCapCents: 250000 });

    expect(res.status).toBe(200);
    expect(res.body.config.cadenceMinutes).toBe(31);
    expect(res.body.config.maxActionsPerTick).toBe(12);
    expect(res.body.config.budgetCapCents).toBe(250000);

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.cadenceMinutes).toBe(31);
    expect(stored?.maxActionsPerTick).toBe(12);
    expect(stored?.budgetCapCents).toBe(250000);
  });

  it("ignores non-numeric / NaN caps, leaving the stored values unchanged", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Seed valid caps first.
    await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: 60, maxActionsPerTick: 10, budgetCapCents: 100000 });

    // Send garbage — each should be ignored and the prior value preserved.
    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: "soon", maxActionsPerTick: "lots", budgetCapCents: "free" });

    expect(res.status).toBe(200);
    expect(res.body.config.cadenceMinutes).toBe(60);
    expect(res.body.config.maxActionsPerTick).toBe(10);
    expect(res.body.config.budgetCapCents).toBe(100000);

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.cadenceMinutes).toBe(60);
    expect(stored?.maxActionsPerTick).toBe(10);
    expect(stored?.budgetCapCents).toBe(100000);
  });

  it("clears a cap back to default behavior when sent null", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Seed valid caps first.
    await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: 60, maxActionsPerTick: 10, budgetCapCents: 100000 });

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ cadenceMinutes: null, maxActionsPerTick: null, budgetCapCents: null });

    expect(res.status).toBe(200);
    expect(res.body.config.cadenceMinutes).toBeNull();
    expect(res.body.config.maxActionsPerTick).toBeNull();
    expect(res.body.config.budgetCapCents).toBeNull();

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.cadenceMinutes).toBeNull();
    expect(stored?.maxActionsPerTick).toBeNull();
    expect(stored?.budgetCapCents).toBeNull();
  });

  it("a caps-only save preserves prefs and other fields", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    // Seed prefs, an enabled flag, and caps.
    await request(app)
      .put("/api/autopilot/marketing")
      .send({
        enabled: true,
        cadenceMinutes: 60,
        prefs: { platforms: ["twitter"], tone: "bold", topics: ["Launch"] },
      });

    // Touch only the caps; prefs, enabled, and untouched caps must remain.
    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ maxActionsPerTick: 25, budgetCapCents: 500000 });

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(true);
    expect(res.body.config.cadenceMinutes).toBe(60);
    expect(res.body.config.maxActionsPerTick).toBe(25);
    expect(res.body.config.budgetCapCents).toBe(500000);
    expect(res.body.config.prefs).toEqual({
      platforms: ["twitter"], tone: "bold", topics: ["Launch"], generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(true);
    expect(stored?.cadenceMinutes).toBe(60);
    expect(stored?.maxActionsPerTick).toBe(25);
    expect(stored?.budgetCapCents).toBe(500000);
    expect(stored?.prefs).toEqual({
      platforms: ["twitter"], tone: "bold", topics: ["Launch"],
      generateImages: false, imageGenerationApprovedBy: null,
    });
  });
});

describe("PUT /api/autopilot/:domain — each domain sanitizes with its own prefs shape", () => {
  it("drops marketing-shaped junk on a non-marketing domain, degrading to that domain's defaults", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/accounting")
      .send({ enabled: true, prefs: { platforms: ["twitter"], tone: "bold", topics: ["Nope"] } });

    expect(res.status).toBe(200);
    // Other settings still applied; marketing-shaped keys are not part of the
    // accounting prefs shape, so they are stripped and the accounting defaults land.
    expect(res.body.config.enabled).toBe(true);
    const accountingDefaults = sanitizeAccountingPrefs({});
    expect(res.body.config.prefs).toEqual(accountingDefaults);
    expect(res.body.config.prefs).not.toHaveProperty("platforms");
    expect(res.body.config.prefs).not.toHaveProperty("tone");
    expect(res.body.config.prefs).not.toHaveProperty("topics");
    const stored = await getStoredConfig(orgId, "accounting");
    expect(stored?.prefs).toEqual(accountingDefaults);
  });

  it("400 on an unknown domain", async () => {
    const owner = await createUser();
    await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/nonsense")
      .send({ prefs: { tone: "bold" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown domain/);
  });
});

describe("PUT /api/autopilot/:domain — permission gating (autopilot.manage)", () => {
  it("401 when unauthenticated", async () => {
    setAuthed(false);
    const res = await request(app).put("/api/autopilot/marketing").send({ prefs: { tone: "bold" } });
    expect(res.status).toBe(401);
  });

  it("403 when the caller lacks autopilot.manage (specialist, below the manager default)", async () => {
    const owner = await createUser();
    const specialist = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: specialist.id, role: "specialist" }]);
    actAs(specialist);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["twitter"], tone: "bold" } });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
    // Nothing was written for the org.
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored).toBeNull();
  });

  it("200 when a manager (at/above the default min role) saves prefs", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: manager.id, role: "manager" }]);
    actAs(manager);

    const res = await request(app)
      .put("/api/autopilot/marketing")
      .send({ prefs: { platforms: ["linkedin"], tone: "professional", topics: ["Update"] } });

    expect(res.status).toBe(200);
    expect(res.body.config.prefs).toEqual({
      platforms: ["linkedin"], tone: "professional", topics: ["Update"], generateImages: false,
    });
    expect(res.body.config.prefs).not.toHaveProperty("imageGenerationApprovedBy");
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({
      platforms: ["linkedin"], tone: "professional", topics: ["Update"],
      generateImages: false, imageGenerationApprovedBy: null,
    });
  });

  it("requires finance.manage for accounting changes but lets an autopilot manager pause the workflow", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: manager.id, role: "manager" }]);

    actAs(owner);
    const ownerSave = await request(app).put("/api/autopilot/accounting").send({
      enabled: true,
      prefs: { payroll: true, billPayments: true },
    });
    expect(ownerSave.status).toBe(200);

    actAs(manager);
    const prefsAttempt = await request(app).put("/api/autopilot/accounting").send({
      prefs: { payroll: false },
    });
    expect(prefsAttempt.status).toBe(403);
    expect(prefsAttempt.body.error).toMatch(/finance manager/i);
    expect((await getStoredConfig(orgId, "accounting"))?.prefs).toMatchObject({
      payroll: true,
      billPayments: true,
    });

    const pause = await request(app).put("/api/autopilot/accounting").send({ enabled: false });
    expect(pause.status).toBe(200);
    expect(pause.body.config.enabled).toBe(false);

    const enableAttempt = await request(app).put("/api/autopilot/accounting").send({ enabled: true });
    expect(enableAttempt.status).toBe(403);
    expect((await getStoredConfig(orgId, "accounting"))?.enabled).toBe(false);
  });

  it("404 when the caller has no organization", async () => {
    const loner = await createUser();
    actAs(loner);
    const res = await request(app).put("/api/autopilot/marketing").send({ prefs: { tone: "bold" } });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/autopilot/:domain — no bot assignment", () => {
  it("rejects the legacy botId field and does not write a config", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/marketing").send({ botId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pablo Prime owns automation/);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored).toBeNull();
  });
});

describe("Creative Work owner project targeting", () => {
  it("requires a project before enabling and clamps its schedule to once daily", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const missingTarget = await request(app).put("/api/autopilot/creative_work").send({ enabled: true });
    expect(missingTarget.status).toBe(400);
    expect(await getStoredConfig(orgId, "creative_work")).toBeNull();

    const projectId = await createWorkspaceProject(owner.id);
    const enabled = await request(app).put("/api/autopilot/creative_work").send({
      enabled: true,
      cadenceMinutes: 5,
      prefs: { projectId },
    });

    expect(enabled.status).toBe(200);
    expect(enabled.body.config.enabled).toBe(true);
    expect(enabled.body.config.cadenceMinutes).toBe(AUTOPILOT_CREATIVE_WORK_CADENCE_MINUTES);
    expect(enabled.body.config.prefs).toEqual({ projectId, focus: "" });
    expect((await getStoredConfig(orgId, "creative_work"))?.prefs).toEqual({ projectId, focus: "" });
  });

  it("rejects a project that is not owned by the organization owner", async () => {
    const owner = await createUser();
    const otherUser = await createUser();
    const orgId = await createOrg(owner.id);
    const otherProjectId = await createWorkspaceProject(otherUser.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/creative_work").send({
      prefs: { projectId: otherProjectId },
    });

    expect(res.status).toBe(400);
    expect(await getStoredConfig(orgId, "creative_work")).toBeNull();
  });

  it("hides the private target and denies configuration to organization managers", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: manager.id, role: "manager" }]);
    const projectId = await createWorkspaceProject(owner.id);
    actAs(owner);
    await request(app).put("/api/autopilot/creative_work").send({
      enabled: true,
      prefs: { projectId },
    });

    actAs(manager);
    const view = await request(app).get("/api/autopilot");
    expect(view.status).toBe(200);
    expect(view.body.creative).toEqual({ canManage: false, projects: [] });
    expect(view.body.domains.find((domain: { domain: string }) => domain.domain === "creative_work").prefs).toEqual({});

    const update = await request(app).put("/api/autopilot/creative_work").send({ enabled: false });
    expect(update.status).toBe(403);
    expect((await getStoredConfig(orgId, "creative_work"))?.enabled).toBe(true);
  });
});

describe("Market Research owner scope and opt-in configuration", () => {
  it("requires a topic and forces a daily cadence without adding the domain to Prime auto-start", async () => {
    expect(AUTOPILOT_PRIME_AUTO_START_DOMAINS).toEqual(["business_ops", "marketing", "crm_calls", "accounting"]);
    expect(AUTOPILOT_PRIME_AUTO_START_DOMAINS).not.toContain("market_research");
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const missingTopic = await request(app).put("/api/autopilot/market_research").send({ enabled: true });
    expect(missingTopic.status).toBe(400);
    expect(await getStoredConfig(orgId, "market_research")).toBeNull();

    const enabled = await request(app).put("/api/autopilot/market_research").send({
      enabled: true,
      cadenceMinutes: 5,
      prefs: { subject: "  Clinic payroll software ", region: " Vietnam ", competitors: " A, B " },
    });

    expect(enabled.status).toBe(200);
    expect(enabled.body.config.enabled).toBe(true);
    expect(enabled.body.config.cadenceMinutes).toBe(AUTOPILOT_MARKET_RESEARCH_CADENCE_MINUTES);
    expect(enabled.body.config.prefs).toEqual({
      subject: "Clinic payroll software",
      region: "Vietnam",
      competitors: "A, B",
      autoInvestigateRecentCalls: false,
    });
    expect((await getStoredConfig(orgId, "market_research"))?.enabled).toBe(true);
  });

  it("keeps scope and report details private from managers while the owner can review them", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: manager.id, role: "manager" }]);
    actAs(owner);
    await request(app).put("/api/autopilot/market_research").send({
      enabled: true,
      prefs: { subject: "Private market scope" },
    });
    await db.insert(autopilotActivityLogTable).values({
      orgId,
      domain: "market_research",
      action: "research_brief",
      summary: "A private sourced brief.",
      outcome: "success",
      detail: {
        report: "Owner-only research text.",
        sources: [{ title: "Source", url: "https://example.com" }],
      },
    });

    actAs(manager);
    const managerView = await request(app).get("/api/autopilot");
    expect(managerView.status).toBe(200);
    expect(managerView.body.marketResearch).toEqual({ canManage: false });
    expect(managerView.body.domains.find((row: { domain: string }) => row.domain === "market_research").prefs).toEqual({});
    expect(managerView.body.activity.some((row: { domain: string }) => row.domain === "market_research")).toBe(false);

    const managerFeed = await request(app).get("/api/autopilot/activity?domain=market_research");
    expect(managerFeed.status).toBe(200);
    expect(managerFeed.body.activity).toEqual([]);
    const managerUpdate = await request(app).put("/api/autopilot/market_research").send({ enabled: false });
    expect(managerUpdate.status).toBe(403);

    actAs(owner);
    const ownerView = await request(app).get("/api/autopilot");
    expect(ownerView.body.domains.find((row: { domain: string }) => row.domain === "market_research").prefs.subject)
      .toBe("Private market scope");
    expect(ownerView.body.activity.some((row: { domain: string; detail?: { report?: string } }) =>
      row.domain === "market_research" && row.detail?.report === "Owner-only research text.",
    )).toBe(true);
  });
});
