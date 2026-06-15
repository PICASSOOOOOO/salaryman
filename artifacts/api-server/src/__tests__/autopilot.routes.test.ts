import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  AUTOPILOT_DEFAULT_MARKETING_TONE,
  AUTOPILOT_MAX_MARKETING_TOPICS,
  AUTOPILOT_MAX_MARKETING_TOPIC_LEN,
} from "@workspace/db";
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

describe("PUT /api/autopilot/:domain — prefs ignored for non-marketing domains", () => {
  it("does not persist prefs on a non-marketing domain", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app)
      .put("/api/autopilot/accounting")
      .send({ enabled: true, prefs: { platforms: ["twitter"], tone: "bold", topics: ["Nope"] } });

    expect(res.status).toBe(200);
    // Other settings still applied, but prefs stays the empty default.
    expect(res.body.config.enabled).toBe(true);
    expect(res.body.config.prefs).toEqual({});
    const stored = await getStoredConfig(orgId, "accounting");
    expect(stored?.prefs).toEqual({});
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
