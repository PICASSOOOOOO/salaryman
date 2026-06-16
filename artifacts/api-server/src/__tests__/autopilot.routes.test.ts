import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
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
  createBot,
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

  it("toggling enabled alone preserves the bot, caps and prefs already saved", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const botId = await createBot({ orgId, ownerId: owner.id });
    actAs(owner);

    // Seed a fully-configured, enabled domain.
    await request(app).put("/api/autopilot/marketing").send({
      enabled: true,
      botId,
      cadenceMinutes: 60,
      maxActionsPerTick: 10,
      budgetCapCents: 100000,
      prefs: { platforms: ["twitter"], tone: "bold", topics: ["Launch"] },
    });

    // Flip OFF without touching anything else.
    const res = await request(app).put("/api/autopilot/marketing").send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(false);
    expect(res.body.config.botId).toBe(botId);
    expect(res.body.config.cadenceMinutes).toBe(60);
    expect(res.body.config.maxActionsPerTick).toBe(10);
    expect(res.body.config.budgetCapCents).toBe(100000);
    expect(res.body.config.prefs).toEqual({ platforms: ["twitter"], tone: "bold", topics: ["Launch"] });

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(false);
    expect(stored?.botId).toBe(botId);
    expect(stored?.cadenceMinutes).toBe(60);
    expect(stored?.maxActionsPerTick).toBe(10);
    expect(stored?.budgetCapCents).toBe(100000);
    expect(stored?.prefs).toEqual({ platforms: ["twitter"], tone: "bold", topics: ["Launch"] });
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
    expect(prefs.topics[0]).toBe("Summer sale");
    expect(prefs.topics).toHaveLength(AUTOPILOT_MAX_MARKETING_TOPICS);
    expect(prefs.topics.every((t: string) => t.length > 0 && t.length <= AUTOPILOT_MAX_MARKETING_TOPIC_LEN)).toBe(true);

    // What landed in the database matches the sanitized response, not the raw body.
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual(prefs);
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
    });
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({ platforms: ["bluesky", "linkedin"], tone: "playful", topics: ["Launch"] });
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
    });
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({ platforms: ["twitter", "instagram"], tone: "witty", topics: ["Hiring", "Product"] });
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
    });
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
    expect(res.body.config.prefs).toEqual({ platforms: ["twitter"], tone: "bold", topics: ["Launch"] });

    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.enabled).toBe(true);
    expect(stored?.cadenceMinutes).toBe(60);
    expect(stored?.maxActionsPerTick).toBe(25);
    expect(stored?.budgetCapCents).toBe(500000);
    expect(stored?.prefs).toEqual({ platforms: ["twitter"], tone: "bold", topics: ["Launch"] });
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
    expect(res.body.config.prefs).toEqual({ platforms: ["linkedin"], tone: "professional", topics: ["Update"] });
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.prefs).toEqual({ platforms: ["linkedin"], tone: "professional", topics: ["Update"] });
  });

  it("404 when the caller has no organization", async () => {
    const loner = await createUser();
    actAs(loner);
    const res = await request(app).put("/api/autopilot/marketing").send({ prefs: { tone: "bold" } });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/autopilot/:domain — bot assignment (cross-org hijack guard)", () => {
  it("assigns a bot owned by the caller's own org → 200, botId persisted", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const botId = await createBot({ orgId, ownerId: owner.id });
    actAs(owner);

    const res = await request(app).put("/api/autopilot/marketing").send({ botId });

    expect(res.status).toBe(200);
    expect(res.body.config.botId).toBe(botId);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.botId).toBe(botId);
  });

  it("400 when botId is not a finite number", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/marketing").send({ botId: "not-a-number" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid botId/);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored).toBeNull();
  });

  it("400 'Bot not found' for a non-existent botId", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).put("/api/autopilot/marketing").send({ botId: 2_000_000_000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Bot not found/);
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored).toBeNull();
  });

  it("400 when the bot belongs to a different org (cross-org hijack attempt)", async () => {
    // Victim org owns a bot; attacker (a separate org owner) tries to assign it.
    const victim = await createUser();
    const victimOrgId = await createOrg(victim.id);
    const victimBotId = await createBot({ orgId: victimOrgId, ownerId: victim.id });

    const attacker = await createUser();
    const attackerOrgId = await createOrg(attacker.id);
    actAs(attacker);

    const res = await request(app).put("/api/autopilot/marketing").send({ botId: victimBotId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to this organization/);
    // Nothing was written for the attacker's org.
    const stored = await getStoredConfig(attackerOrgId, "marketing");
    expect(stored).toBeNull();
  });

  it("botId: null clears a previously-assigned bot", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const botId = await createBot({ orgId, ownerId: owner.id });
    actAs(owner);

    // Assign first.
    const assign = await request(app).put("/api/autopilot/marketing").send({ botId });
    expect(assign.status).toBe(200);
    expect(assign.body.config.botId).toBe(botId);

    // Then clear.
    const clear = await request(app).put("/api/autopilot/marketing").send({ botId: null });
    expect(clear.status).toBe(200);
    expect(clear.body.config.botId).toBeNull();
    const stored = await getStoredConfig(orgId, "marketing");
    expect(stored?.botId).toBeNull();
  });
});
