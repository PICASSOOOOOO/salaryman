import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  orgMembersTable,
  autopilotActivityLogTable,
  type OrgRole,
  type AutopilotDomain,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  recordAutopilotActivity,
  getRecentAutopilotActivity,
} from "../lib/autopilot/activity";
import autopilotRouter from "../routes/autopilot";

// ─── Library read-path: getRecentAutopilotActivity ───────────────────────────
// The activity feed is the org-scoped audit log. These tests drive the read path
// against the REAL dev DB to prove newest-first ordering, the domain filter, and
// the `before`-id cursor used by the dashboard's load-more pagination.
describe("getRecentAutopilotActivity — pagination", () => {
  const OWNER_ID = `aptest-activity-${randomUUID()}`;
  const OWNER_EMAIL = `activity-${randomUUID().slice(0, 8)}@test`;
  let orgId: number;

  beforeAll(async () => {
    await db.insert(usersTable).values({ id: OWNER_ID, email: OWNER_EMAIL });
    const [org] = await db
      .insert(organizationsTable)
      .values({ name: `Activity Test Org ${randomUUID().slice(0, 8)}`, ownerUserId: OWNER_ID })
      .returning({ id: organizationsTable.id });
    orgId = org.id;
  });

  beforeEach(async () => {
    await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
  });

  afterAll(async () => {
    await db.delete(autopilotActivityLogTable).where(eq(autopilotActivityLogTable.orgId, orgId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
    await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
  });

  async function seed(count: number, domain: AutopilotDomain = "business_ops") {
    for (let i = 0; i < count; i++) {
      await recordAutopilotActivity({
        orgId,
        domain,
        action: "test",
        summary: `entry ${i}`,
        outcome: "success",
      });
    }
  }

  it("returns newest-first and respects the limit", async () => {
    await seed(5);
    const rows = await getRecentAutopilotActivity(orgId, { limit: 3 });
    expect(rows).toHaveLength(3);
    expect(rows[0].summary).toBe("entry 4");
    expect(rows[2].summary).toBe("entry 2");
  });

  it("pages backwards past the oldest loaded entry via the before cursor", async () => {
    await seed(5);
    const first = await getRecentAutopilotActivity(orgId, { limit: 2 });
    expect(first.map((r) => r.summary)).toEqual(["entry 4", "entry 3"]);

    const cursor = first[first.length - 1].id;
    const second = await getRecentAutopilotActivity(orgId, { limit: 2, before: cursor });
    expect(second.map((r) => r.summary)).toEqual(["entry 2", "entry 1"]);

    const cursor2 = second[second.length - 1].id;
    const third = await getRecentAutopilotActivity(orgId, { limit: 2, before: cursor2 });
    expect(third.map((r) => r.summary)).toEqual(["entry 0"]);

    // No overlap and no gaps across pages.
    const all = [...first, ...second, ...third].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(5);
  });

  it("keeps the domain filter while paging", async () => {
    await seed(3, "business_ops");
    await seed(3, "marketing");

    const page1 = await getRecentAutopilotActivity(orgId, { domain: "marketing", limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page1.every((r) => r.domain === "marketing")).toBe(true);

    const page2 = await getRecentAutopilotActivity(orgId, {
      domain: "marketing",
      limit: 2,
      before: page1[page1.length - 1].id,
    });
    expect(page2).toHaveLength(1);
    expect(page2.every((r) => r.domain === "marketing")).toBe(true);
  });
});

// ─── HTTP route: GET /api/autopilot/activity ─────────────────────────────────
// Drives the endpoint through supertest with an injected auth middleware to lock
// in org-scoping, the owner/manager permission gate, the ?domain= filter, and
// limit clamping.
describe("GET /api/autopilot/activity — org-scoped, gated activity feed", () => {
  // Mutable auth state read by the injected middleware. Tests flip `user` to act
  // as different members / outsiders, and `authed` to false for the guest path.
  const authState: { authed: boolean; user: { id: string } } = {
    authed: true,
    user: { id: "" },
  };
  function actAs(user: { id: string }) {
    authState.authed = true;
    authState.user = user;
  }
  function actAsGuest() {
    authState.authed = false;
    authState.user = { id: "" };
  }

  const createdUserIds: string[] = [];
  const createdOrgIds: number[] = [];

  function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
      (req as unknown as { user: { id: string } }).user = authState.user;
      next();
    });
    app.use("/api", autopilotRouter);
    return app;
  }

  async function createUser(): Promise<{ id: string }> {
    const email = `ap-activity-${randomUUID().slice(0, 8)}@example.test`;
    const [row] = await db.insert(usersTable).values({ email }).returning({ id: usersTable.id });
    createdUserIds.push(row.id);
    return { id: row.id };
  }

  async function createOrg(ownerId: string): Promise<number> {
    const [org] = await db
      .insert(organizationsTable)
      .values({ name: `AP Activity Org ${randomUUID().slice(0, 8)}`, ownerUserId: ownerId })
      .returning({ id: organizationsTable.id });
    createdOrgIds.push(org.id);
    return org.id;
  }

  async function addMember(orgId: number, userId: string, role: OrgRole) {
    await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
    // Make this org the user's current org so resolveCurrentOrgId is deterministic.
    await db.update(usersTable).set({ currentOrgId: String(orgId) }).where(eq(usersTable.id, userId));
  }

  /** Insert one activity row with an explicit createdAt so ordering is testable. */
  async function seedActivity(
    orgId: number,
    domain: AutopilotDomain,
    action: string,
    createdAt: Date
  ) {
    await db.insert(autopilotActivityLogTable).values({
      orgId,
      domain,
      action,
      summary: `${action} summary`,
      outcome: "success",
      detail: {},
      createdAt,
    });
  }

  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });
  beforeEach(() => {
    actAsGuest();
  });
  afterAll(async () => {
    if (createdOrgIds.length) {
      await db.delete(autopilotActivityLogTable).where(inArray(autopilotActivityLogTable.orgId, createdOrgIds));
      await db.delete(orgMembersTable).where(inArray(orgMembersTable.orgId, createdOrgIds));
      await db.delete(organizationsTable).where(inArray(organizationsTable.id, createdOrgIds));
    }
    if (createdUserIds.length) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  });

  it("returns only the caller's org activity, newest first", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");

    // A second org with its own activity that must NEVER leak into org A's feed.
    const otherOwner = await createUser();
    const otherOrgId = await createOrg(otherOwner.id);
    await addMember(otherOrgId, otherOwner.id, "owner");

    const base = Date.now();
    await seedActivity(orgId, "marketing", "older", new Date(base - 60_000));
    await seedActivity(orgId, "crm_calls", "newest", new Date(base));
    await seedActivity(orgId, "accounting", "middle", new Date(base - 30_000));
    // Foreign-org noise.
    await seedActivity(otherOrgId, "marketing", "foreign", new Date(base + 5_000));

    actAs(owner);
    const res = await request(app).get("/api/autopilot/activity");
    expect(res.status).toBe(200);

    const actions = (res.body.activity as Array<{ action: string; orgId: number }>).map((a) => a.action);
    // Newest-first ordering by createdAt.
    expect(actions).toEqual(["newest", "middle", "older"]);
    // Nothing from the other org bled through.
    expect(actions).not.toContain("foreign");
    expect((res.body.activity as Array<{ orgId: number }>).every((a) => a.orgId === orgId)).toBe(true);
    expect(res.body.domain).toBeNull();
  });

  it("narrows to one domain with ?domain= and falls back to all on an invalid domain", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");

    const base = Date.now();
    await seedActivity(orgId, "marketing", "mkt1", new Date(base - 20_000));
    await seedActivity(orgId, "marketing", "mkt2", new Date(base - 10_000));
    await seedActivity(orgId, "crm_calls", "crm1", new Date(base));

    actAs(owner);

    // Valid filter → only that domain, and the response echoes the active domain.
    const filtered = await request(app).get("/api/autopilot/activity?domain=marketing");
    expect(filtered.status).toBe(200);
    expect(filtered.body.domain).toBe("marketing");
    const filteredActions = (filtered.body.activity as Array<{ action: string; domain: string }>).map((a) => a.action);
    expect(filteredActions.sort()).toEqual(["mkt1", "mkt2"]);
    expect((filtered.body.activity as Array<{ domain: string }>).every((a) => a.domain === "marketing")).toBe(true);

    // Unknown domain → ignored, all activity returned, domain echoed as null.
    const bogus = await request(app).get("/api/autopilot/activity?domain=not_a_domain");
    expect(bogus.status).toBe(200);
    expect(bogus.body.domain).toBeNull();
    expect((bogus.body.activity as unknown[]).length).toBe(3);
  });

  it("clamps the limit to 1–200", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");

    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedActivity(orgId, "marketing", `row${i}`, new Date(base - i * 1_000));
    }

    actAs(owner);

    // limit below the floor clamps up to 1 (not 0/negative → no rows).
    const tooSmall = await request(app).get("/api/autopilot/activity?limit=0");
    expect(tooSmall.status).toBe(200);
    expect((tooSmall.body.activity as unknown[]).length).toBe(1);

    const negative = await request(app).get("/api/autopilot/activity?limit=-10");
    expect((negative.body.activity as unknown[]).length).toBe(1);

    // A huge limit is capped at 200 — well above our 5 rows, so all 5 return.
    const tooBig = await request(app).get("/api/autopilot/activity?limit=99999");
    expect((tooBig.body.activity as unknown[]).length).toBe(5);

    // Non-numeric limit falls back to the default (50 > 5 rows → all 5).
    const nan = await request(app).get("/api/autopilot/activity?limit=abc");
    expect((nan.body.activity as unknown[]).length).toBe(5);
  });

  it("rejects unauthenticated callers with 401", async () => {
    actAsGuest();
    const res = await request(app).get("/api/autopilot/activity");
    expect(res.status).toBe(401);
  });

  it("rejects org members without the autopilot.manage permission with 403", async () => {
    const owner = await createUser();
    const orgId = await createOrg(owner.id);
    await addMember(orgId, owner.id, "owner");

    // A low-rank member that does not meet the autopilot.manage minRole.
    const specialist = await createUser();
    await addMember(orgId, specialist.id, "specialist");

    await seedActivity(orgId, "marketing", "secret", new Date());

    actAs(specialist);
    const res = await request(app).get("/api/autopilot/activity");
    expect(res.status).toBe(403);
    // The forbidden member never sees the feed.
    expect(res.body.activity).toBeUndefined();
  });

  it("returns 404 when the caller belongs to no organization", async () => {
    const loner = await createUser();
    actAs(loner);
    const res = await request(app).get("/api/autopilot/activity");
    expect(res.status).toBe(404);
    expect(res.body.activity).toEqual([]);
  });
});
