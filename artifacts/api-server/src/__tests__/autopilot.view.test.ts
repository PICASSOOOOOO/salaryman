import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  AUTOPILOT_DOMAINS,
  AUTOPILOT_DOMAIN_META,
  AUTOPILOT_MARKETING_TONES,
  AUTOPILOT_CRM_LEAD_STATUSES,
  AUTOPILOT_DEFAULT_CADENCE_MINUTES,
  AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
} from "@workspace/db";
import { SOCIAL_PLATFORMS } from "../lib/social-service";
import {
  buildApp,
  actAs,
  setAuthed,
  createUser,
  createOrg,
  createBot,
  cleanupTestData,
} from "./helpers/autopilotTestApp";

// Integration coverage for GET /api/autopilot — the read path the dashboard
// loads on open. It merges each org's stored config over the four-domain
// defaults, lists ONLY that org's bots, surfaces marketing/CRM option metadata,
// and enforces the same autopilot.manage / no-org / unauthenticated gates as the
// save path. These tests lock in that an org always sees all four domains, that
// one org never sees another org's bots, and that the gates hold.

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

describe("GET /api/autopilot — domains merged with defaults", () => {
  it("returns all four domains, each OFF with default shape when no row exists", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(orgId);
    expect(Array.isArray(res.body.domains)).toBe(true);
    expect(res.body.domains).toHaveLength(AUTOPILOT_DOMAINS.length);

    // Every known domain is present exactly once, in the canonical order.
    expect(res.body.domains.map((d: { domain: string }) => d.domain)).toEqual([...AUTOPILOT_DOMAINS]);

    for (const domain of res.body.domains) {
      expect(domain.exists).toBe(false);
      expect(domain.enabled).toBe(false);
      expect(domain.botId).toBeNull();
      expect(domain.cadenceMinutes).toBeNull();
      expect(domain.maxActionsPerTick).toBeNull();
      expect(domain.budgetCapCents).toBeNull();
      expect(domain.prefs).toEqual({});
      expect(domain.lastRunAt).toBeNull();
      expect(domain.updatedBy).toBeNull();
    }
  });

  it("merges a stored, fully-configured domain over the defaults while the rest stay OFF", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const botId = await createBot({ orgId, ownerId: owner.id });
    actAs(owner);

    // Configure one domain via the save path so the read path reflects it.
    await request(app).put("/api/autopilot/marketing").send({
      enabled: true,
      botId,
      cadenceMinutes: 60,
      maxActionsPerTick: 10,
      budgetCapCents: 100000,
      prefs: { platforms: ["twitter"], tone: "bold", topics: ["Launch"] },
    });

    const res = await request(app).get("/api/autopilot");
    expect(res.status).toBe(200);

    const byDomain = new Map(res.body.domains.map((d: { domain: string }) => [d.domain, d]));

    const marketing = byDomain.get("marketing") as Record<string, unknown>;
    expect(marketing.exists).toBe(true);
    expect(marketing.enabled).toBe(true);
    expect(marketing.botId).toBe(botId);
    expect(marketing.cadenceMinutes).toBe(60);
    expect(marketing.maxActionsPerTick).toBe(10);
    expect(marketing.budgetCapCents).toBe(100000);
    expect(marketing.prefs).toEqual({ platforms: ["twitter"], tone: "bold", topics: ["Launch"] });
    expect(marketing.updatedBy).toBe(owner.id);

    // The other three domains remain at their OFF defaults.
    for (const domain of AUTOPILOT_DOMAINS.filter((d) => d !== "marketing")) {
      const view = byDomain.get(domain) as Record<string, unknown>;
      expect(view.exists).toBe(false);
      expect(view.enabled).toBe(false);
      expect(view.botId).toBeNull();
    }
  });
});

describe("GET /api/autopilot — bot listing is scoped to the caller's org", () => {
  it("lists the org's own bots", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const botA = await createBot({ orgId, ownerId: owner.id, name: "Agent A" });
    const botB = await createBot({ orgId, ownerId: owner.id, name: "Agent B" });
    actAs(owner);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);
    const ids = res.body.bots.map((b: { id: number }) => b.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([botA, botB].sort((a, b) => a - b));
    // Each listed bot carries the columns the dashboard renders.
    for (const bot of res.body.bots) {
      expect(bot).toHaveProperty("id");
      expect(bot).toHaveProperty("name");
      expect(bot).toHaveProperty("status");
      expect(bot).toHaveProperty("department");
    }
  });

  it("never leaks another org's bots", async () => {
    // A separate org owns a bot; the caller must not see it.
    const other = await createUser();
    const otherOrgId = await createOrg(other.id);
    const otherBotId = await createBot({ orgId: otherOrgId, ownerId: other.id, name: "Other Org Bot" });

    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    const ownBotId = await createBot({ orgId, ownerId: owner.id, name: "My Bot" });
    actAs(owner);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);
    const ids = res.body.bots.map((b: { id: number }) => b.id);
    expect(ids).toContain(ownBotId);
    expect(ids).not.toContain(otherBotId);
  });

  it("returns an empty bot list for an org with no bots", async () => {
    const owner = await createUser();
    await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);
    expect(res.body.bots).toEqual([]);
  });
});

describe("GET /api/autopilot — option metadata for the dashboard", () => {
  it("surfaces domain meta, defaults, marketing tones/platforms and CRM lead statuses", async () => {
    const owner = await createUser();
    await createOrg(owner.id);
    actAs(owner);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);

    // Per-domain labels/descriptions.
    expect(res.body.meta).toEqual(AUTOPILOT_DOMAIN_META);

    // Scheduling defaults shown when an org has not set its own.
    expect(res.body.defaults).toEqual({
      cadenceMinutes: AUTOPILOT_DEFAULT_CADENCE_MINUTES,
      maxActionsPerTick: AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK,
    });

    // Marketing tone choices, verbatim.
    expect(res.body.marketing.tones).toEqual([...AUTOPILOT_MARKETING_TONES]);

    // Marketing platform allow-list, each with an id + display label.
    expect(res.body.marketing.platforms.map((p: { id: string }) => p.id)).toEqual([...SOCIAL_PLATFORMS]);
    for (const platform of res.body.marketing.platforms) {
      expect(typeof platform.id).toBe("string");
      expect(typeof platform.label).toBe("string");
      expect(platform.label.length).toBeGreaterThan(0);
    }

    // CRM pipeline stages, each with an id + display label.
    expect(res.body.crm.leadStatuses.map((s: { id: string }) => s.id)).toEqual([...AUTOPILOT_CRM_LEAD_STATUSES]);
    for (const status of res.body.crm.leadStatuses) {
      expect(typeof status.id).toBe("string");
      expect(typeof status.label).toBe("string");
      expect(status.label.length).toBeGreaterThan(0);
    }

    // The activity feed key is always present (empty for a fresh org).
    expect(Array.isArray(res.body.activity)).toBe(true);
  });
});

describe("GET /api/autopilot — permission gating (autopilot.manage)", () => {
  it("401 when unauthenticated", async () => {
    setAuthed(false);
    const res = await request(app).get("/api/autopilot");
    expect(res.status).toBe(401);
  });

  it("404 when the caller has no organization", async () => {
    const loner = await createUser();
    actAs(loner);
    const res = await request(app).get("/api/autopilot");
    expect(res.status).toBe(404);
    // The shape stays consumable by the dashboard even on the no-org path.
    expect(res.body.domains).toEqual([]);
    expect(res.body.bots).toEqual([]);
  });

  it("403 when the caller lacks autopilot.manage (specialist, below the manager default)", async () => {
    const owner = await createUser();
    const specialist = await createUser();
    await createOrg(owner.id, [{ userId: specialist.id, role: "specialist" }]);
    actAs(specialist);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it("200 when a manager (at/above the default min role) reads the control surface", async () => {
    const owner = await createUser();
    const manager = await createUser();
    const orgId = await createOrg(owner.id, [{ userId: manager.id, role: "manager" }]);
    actAs(manager);

    const res = await request(app).get("/api/autopilot");

    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe(orgId);
    expect(res.body.domains).toHaveLength(AUTOPILOT_DOMAINS.length);
  });
});
