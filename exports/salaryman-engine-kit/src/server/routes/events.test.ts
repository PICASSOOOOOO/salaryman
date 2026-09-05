import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// All mocks hoisted so the vi.mock factories can reference them.
const mocks = vi.hoisted(() => {
  // Queue of result arrays returned by consecutive db.select() chains.
  // Push arrays in the order the route will call them.
  const selectQueue: any[][] = [];

  function makeSelectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(selectQueue.shift() ?? []),
      then: (res: any, rej: any) =>
        Promise.resolve(selectQueue.shift() ?? []).then(res, rej),
      catch: (rej: any) => Promise.resolve(selectQueue.shift() ?? []).catch(rej),
    };
    return chain;
  }

  const db = {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  };

  return {
    selectQueue,
    db,
    getActiveWorldEvents: vi.fn((): any[] => []),
    resolveWorldEvent: vi.fn(),
    sendToPlayer: vi.fn(),
    getPlayerPosition: vi.fn((): { x: number; y: number } | null => null),
    isNearBankOrStore: vi.fn(() => false),
  };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  worldEventsTable: { id: "worldEventsTable.id", status: "worldEventsTable.status", eventType: "worldEventsTable.eventType" },
  eventResponsesTable: { userId: "eventResponsesTable.userId", eventId: "eventResponsesTable.eventId", rewardPaid: "eventResponsesTable.rewardPaid", respondedAt: "eventResponsesTable.respondedAt" },
  playerProfilesTable: { userId: "playerProfilesTable.userId", responderCount: "playerProfilesTable.responderCount", emergencyEarnings: "playerProfilesTable.emergencyEarnings", playerName: "playerProfilesTable.playerName" },
  usersTable: { id: "usersTable.id", firstName: "usersTable.firstName", lastName: "usersTable.lastName", email: "usersTable.email" },
}));

vi.mock("../worldServer", () => ({
  getActiveWorldEvents: mocks.getActiveWorldEvents,
  resolveWorldEvent: mocks.resolveWorldEvent,
  sendToPlayer: mocks.sendToPlayer,
  getPlayerPosition: mocks.getPlayerPosition,
  isNearBankOrStore: mocks.isNearBankOrStore,
}));

// Drizzle operator stubs — the route imports these for query building but they
// are irrelevant to the mocked DB chain, so dummy identity functions are fine.
// `sql` results must carry an `.as()` method because the leaderboard query uses
// sql<number>`sum(...)`.as("alias") to name aggregated columns.
vi.mock("drizzle-orm", () => {
  function makeSqlResult() {
    return { as: (alias: string) => ({ alias }) };
  }
  const sqlTag = (_s: TemplateStringsArray, ..._v: any[]) => makeSqlResult();
  const sql = Object.assign(sqlTag, {
    join: (_arr: any[], _sep: any) => makeSqlResult(),
  });
  return {
    eq: (...args: any[]) => args,
    and: (...args: any[]) => args,
    desc: (x: any) => x,
    sql,
    gte: (...args: any[]) => args,
  };
});

import request from "supertest";
import express, { type Express } from "express";
import eventsRouter from "./events";

// ── App factory ──────────────────────────────────────────────────────────────

function buildApp(userId = "user-1"): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: userId };
    next();
  });
  app.use("/api", eventsRouter);
  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_EVENT = {
  id: 42,
  eventType: "evt_blackout",
  status: "active",
  rewardFiat: 1000,
  resolverUserIds: [] as string[],
};

function pushSelect(...results: any[][]) {
  mocks.selectQueue.push(...results);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // silence route error logs in test output
  vi.spyOn(console, "error").mockImplementation(() => {});
});

beforeEach(() => {
  mocks.selectQueue.length = 0;
  vi.clearAllMocks();
  mocks.getActiveWorldEvents.mockReturnValue([{ id: BASE_EVENT.id }]);
  mocks.getPlayerPosition.mockReturnValue(null);
  mocks.isNearBankOrStore.mockReturnValue(false);
});

describe("POST /api/events/:id/respond", () => {
  it("401 when the caller is not authenticated", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => false;
      (req as any).user = undefined;
      next();
    });
    app.use("/api", eventsRouter);

    const res = await request(app).post("/api/events/42/respond").send();
    expect(res.status).toBe(401);
  });

  it("400 for a non-integer event id", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/events/abc/respond").send();
    expect(res.status).toBe(400);
  });

  it("404 when the event is not in the active world events set", async () => {
    mocks.getActiveWorldEvents.mockReturnValue([]); // no active events
    const app = buildApp();
    const res = await request(app).post("/api/events/42/respond").send();
    expect(res.status).toBe(404);
  });

  it("404 when the event row is missing or not active in the DB", async () => {
    pushSelect([]); // db select returns nothing
    const app = buildApp();
    const res = await request(app).post("/api/events/42/respond").send();
    expect(res.status).toBe(404);
  });

  it("first responder receives the full base reward (100%)", async () => {
    const event = { ...BASE_EVENT, resolverUserIds: [] };
    pushSelect([event]); // worldEventsTable lookup
    const app = buildApp("player-first");

    const res = await request(app).post("/api/events/42/respond").send();

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.isFirstResponder).toBe(true);
    expect(res.body.rewardPaid).toBe(BASE_EVENT.rewardFiat); // 1000 — full reward
    expect(mocks.sendToPlayer).toHaveBeenCalledWith(
      "player-first",
      expect.objectContaining({ type: "event_reward", reward: BASE_EVENT.rewardFiat }),
    );
    expect(mocks.resolveWorldEvent).toHaveBeenCalledWith(42);
  });

  it("second responder receives 40% of the base reward", async () => {
    const event = { ...BASE_EVENT, resolverUserIds: ["player-first"] }; // one prior responder
    pushSelect([event]);
    const app = buildApp("player-second");

    const res = await request(app).post("/api/events/42/respond").send();

    expect(res.status).toBe(200);
    expect(res.body.isFirstResponder).toBe(false);
    expect(res.body.rewardPaid).toBe(Math.floor(BASE_EVENT.rewardFiat * 0.4)); // 400
    expect(mocks.sendToPlayer).toHaveBeenCalledWith(
      "player-second",
      expect.objectContaining({ reward: 400 }),
    );
  });

  it("third respond attempt by the SAME player returns 409 (already responded)", async () => {
    // player-first already in resolverUserIds
    const event = { ...BASE_EVENT, resolverUserIds: ["player-first", "player-second"] };
    // Set userId to someone who already responded
    const event409 = { ...BASE_EVENT, resolverUserIds: ["player-409"] };
    pushSelect([event409]);
    const app = buildApp("player-409"); // this player already responded

    const res = await request(app).post("/api/events/42/respond").send();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already responded/i);
    // no DB writes should happen after the guard
    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.sendToPlayer).not.toHaveBeenCalled();
  });

  it("evt_robbery: 403 when the player is not near a bank or store", async () => {
    const event = { ...BASE_EVENT, eventType: "evt_robbery", resolverUserIds: [] };
    pushSelect([event]);
    mocks.getPlayerPosition.mockReturnValue({ x: 100, y: 100 });
    mocks.isNearBankOrStore.mockReturnValue(false);
    const app = buildApp("player-rob");

    const res = await request(app).post("/api/events/42/respond").send();

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/bank or store/i);
    expect(mocks.sendToPlayer).not.toHaveBeenCalled();
  });

  it("evt_robbery: succeeds when the player is near a bank or store", async () => {
    const event = { ...BASE_EVENT, eventType: "evt_robbery", resolverUserIds: [] };
    pushSelect([event]);
    mocks.getPlayerPosition.mockReturnValue({ x: 50, y: 50 });
    mocks.isNearBankOrStore.mockReturnValue(true);
    const app = buildApp("player-rob");

    const res = await request(app).post("/api/events/42/respond").send();

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rewardPaid).toBe(BASE_EVENT.rewardFiat);
    expect(mocks.sendToPlayer).toHaveBeenCalledWith(
      "player-rob",
      expect.objectContaining({ eventType: "evt_robbery", type: "event_reward" }),
    );
  });

  it("sends the correct event label in the player message for each event type", async () => {
    const cases: Array<[string, string]> = [
      ["evt_blackout", "GRID RESTORED"],
      ["evt_fire", "FIRE SUPPRESSED"],
      ["evt_medical", "CASUALTY STABILISED"],
      ["evt_robbery", "ROBBERY FOILED"],
    ];

    for (const [eventType, label] of cases) {
      vi.clearAllMocks();
      mocks.selectQueue.length = 0;
      mocks.getActiveWorldEvents.mockReturnValue([{ id: 42 }]);

      const isRobbery = eventType === "evt_robbery";
      if (isRobbery) {
        mocks.getPlayerPosition.mockReturnValue({ x: 0, y: 0 });
        mocks.isNearBankOrStore.mockReturnValue(true);
      }

      const event = { ...BASE_EVENT, eventType, resolverUserIds: [] };
      pushSelect([event]);

      const app = buildApp(`player-label-${eventType}`);
      const res = await request(app).post("/api/events/42/respond").send();

      expect(res.status).toBe(200);
      const [, msg] = mocks.sendToPlayer.mock.calls[0];
      expect(msg.message).toContain(label);
    }
  });
});

describe("GET /api/events/responders/weekly (leaderboard)", () => {
  it("returns an empty leaderboard when there are no responses this week", async () => {
    // Main rows query returns empty -> no further queries run
    pushSelect([]); // eventResponsesTable weekly aggregation
    const app = buildApp();

    const res = await request(app).get("/api/events/responders/weekly").send();

    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([]);
  });

  it("includes evt_robbery in the byEventType breakdown for a leaderboard entry", async () => {
    // 1st select: aggregated leaderboard rows (one player)
    const leaderRows = [
      { userId: "player-rob", totalReward: 1000, responseCount: 1 },
    ];
    // 2nd select: per-event-type breakdown (joined query)
    const breakdownRows = [
      { userId: "player-rob", eventType: "evt_robbery", count: 1, reward: 1000 },
    ];
    // 3rd select: player profile names
    const profileRows = [{ userId: "player-rob", playerName: "ROBOCOP" }];
    // 4th select: users table names
    const userRows: any[] = [];

    pushSelect(leaderRows, breakdownRows, profileRows, userRows);

    const app = buildApp();
    const res = await request(app).get("/api/events/responders/weekly").send();

    expect(res.status).toBe(200);
    const [entry] = res.body.leaderboard as any[];
    expect(entry.userId).toBe("player-rob");
    expect(entry.byEventType).toHaveProperty("evt_robbery");
    expect(entry.byEventType.evt_robbery.count).toBe(1);
    expect(entry.byEventType.evt_robbery.reward).toBe(1000);
  });

  it("ranks players by total reward descending and assigns rank correctly", async () => {
    const leaderRows = [
      { userId: "top", totalReward: 5000, responseCount: 5 },
      { userId: "mid", totalReward: 2000, responseCount: 2 },
    ];
    const breakdownRows = [
      { userId: "top", eventType: "evt_fire", count: 5, reward: 5000 },
      { userId: "mid", eventType: "evt_blackout", count: 2, reward: 2000 },
    ];
    const profileRows = [
      { userId: "top", playerName: "ALFA" },
      { userId: "mid", playerName: "BRAVO" },
    ];
    const userRows: any[] = [];

    pushSelect(leaderRows, breakdownRows, profileRows, userRows);

    const app = buildApp();
    const res = await request(app).get("/api/events/responders/weekly").send();

    expect(res.status).toBe(200);
    const [first, second] = res.body.leaderboard as any[];
    expect(first.rank).toBe(1);
    expect(first.name).toBe("ALFA");
    expect(second.rank).toBe(2);
    expect(second.name).toBe("BRAVO");
  });

  it("falls back to user table name when no player profile row exists", async () => {
    const leaderRows = [{ userId: "u-noname", totalReward: 500, responseCount: 1 }];
    const breakdownRows: any[] = [];
    const profileRows: any[] = []; // no profile row
    const userRows = [
      { id: "u-noname", firstName: "Jane", lastName: "Doe", email: "j@example.com" },
    ];

    pushSelect(leaderRows, breakdownRows, profileRows, userRows);

    const app = buildApp();
    const res = await request(app).get("/api/events/responders/weekly").send();

    expect(res.status).toBe(200);
    const [entry] = res.body.leaderboard as any[];
    expect(entry.name).toBe("JANE DOE");
  });

  it("uses OPERATIVE fallback when neither profile nor user row is found", async () => {
    const leaderRows = [{ userId: "ghost", totalReward: 300, responseCount: 1 }];
    const breakdownRows: any[] = [];
    const profileRows: any[] = [];
    const userRows: any[] = [];

    pushSelect(leaderRows, breakdownRows, profileRows, userRows);

    const app = buildApp();
    const res = await request(app).get("/api/events/responders/weekly").send();

    expect(res.status).toBe(200);
    expect(res.body.leaderboard[0].name).toBe("OPERATIVE");
  });
});
