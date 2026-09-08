import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const state = {
    wallet: 0,
    debited: 0,
    charges: [] as number[],
    processedKeys: new Set<string>(),
    save: {
      id: "save-1",
      userId: "arcade-player",
      slotIndex: 0,
      data: {} as Record<string, unknown>,
    },
  };

  const reset = (wallet: number) => {
    state.wallet = wallet;
    state.debited = 0;
    state.charges = [];
    state.processedKeys.clear();
    state.save.data = { rec: {} };
  };

  const spendFiat = vi.fn(async (_tx: unknown, opts: {
    userId: string;
    amountFiat: number;
    description: string;
    kind?: string;
    idempotencyKey?: string;
  }) => {
    const key = opts.idempotencyKey ?? "";
    if (state.processedKeys.has(key)) {
      return { ok: true as const, newBalance: state.wallet, spendable: state.wallet, duplicate: true };
    }
    if (state.wallet < opts.amountFiat) {
      return { ok: false as const, error: "Insufficient spendable FIAT balance", spendable: state.wallet };
    }
    state.wallet -= opts.amountFiat;
    state.debited += opts.amountFiat;
    state.charges.push(opts.amountFiat);
    state.processedKeys.add(key);
    return { ok: true as const, newBalance: state.wallet, spendable: state.wallet };
  });

  const tx = {
    select: vi.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        for: () => chain,
        limit: () => Promise.resolve([state.save]),
      };
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: { data?: Record<string, unknown> }) => ({
        where: vi.fn(async () => {
          if (values.data) state.save.data = values.data;
          return [];
        }),
      })),
    })),
  };

  return { state, reset, spendFiat, tx };
});


vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: typeof routeMocks.tx) => unknown) => callback(routeMocks.tx)),
  },
  orgAccountsTable: {},
  orgAccountTransactionsTable: {},
  orgMembersTable: {},
  playerInventoryTable: {},
  restBedBookingsTable: {},
  restBedsTable: {},
  salarymanSavesTable: { userId: "salarymanSavesTable.userId", slotIndex: "salarymanSavesTable.slotIndex", id: "salarymanSavesTable.id" },
  hasRoleAccess: vi.fn(),
  REST_BED_TYPES: [],
}));

vi.mock("../lib/fiat-wallet", () => ({
  creditFiat: vi.fn(),
  getSpendableFiat: vi.fn(),
  spendFiat: routeMocks.spendFiat,
}));

import request from "supertest";
import express from "express";
import {
  CLASSIC_ARCADE_GAME_IDS, CLASSIC_ARCADE_PRICES, REC_GAME_IDS, REC_GAMES, REC_ITEMS, isClassicArcadeGameId, normalizeRecState, settleRecGame,
} from "../lib/recreation";
import recreationRouter from "../routes/recreation";

function buildArcadeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "arcade-player" };
    next();
  });
  app.use("/api", recreationRouter);
  return app;
}

describe("REC authoritative rules", () => {
  it("keeps the classic arcade cabinet catalog explicit and validated", () => {
    expect(CLASSIC_ARCADE_GAME_IDS).toEqual(["cyber_serpent", "void_invaders", "barrel_runner", "neon_breaker"]);
    for (const id of CLASSIC_ARCADE_GAME_IDS) expect(isClassicArcadeGameId(id)).toBe(true);
    expect(isClassicArcadeGameId("pacman")).toBe(false);
    expect(CLASSIC_ARCADE_PRICES).toEqual({
      cyber_serpent: 10,
      void_invaders: 25,
      barrel_runner: 50,
      neon_breaker: 100,
    });
    for (const price of Object.values(CLASSIC_ARCADE_PRICES)) {
      expect(price).toBeGreaterThanOrEqual(10);
      expect(price).toBeLessThanOrEqual(100);
    }
  });

  it("defines all seven playable stations with positive stamina costs", () => {
    expect(REC_GAME_IDS).toEqual(["arcade", "pool", "air-hockey", "foosball", "shuffleboard", "bowling", "darts"]);
    for (const id of REC_GAME_IDS) expect(REC_GAMES[id].staminaCost).toBeGreaterThan(0);
  });

  it("regenerates stamina on server time and expires timed effects", () => {
    const now = new Date("2026-09-01T12:02:00.000Z");
    const state = normalizeRecState({
      stamina: 10,
      staminaUpdatedAt: "2026-09-01T12:00:00.000Z",
      effects: [
        { kind: "orientation", sourceItemId: "rec-lager", expiresAt: "2026-09-01T12:01:00.000Z" },
        { kind: "focus", sourceItemId: "rec-focus-tonic", expiresAt: "2026-09-01T12:03:00.000Z" },
      ],
    }, now);
    expect(state.stamina).toBe(14);
    expect(state.effects.map((effect) => effect.kind)).toEqual(["focus"]);
  });

  it.each(REC_GAME_IDS)("settles %s deterministically and charges stamina once", (gameId) => {
    const state = normalizeRecState({ stamina: 100, staminaUpdatedAt: "2026-09-01T12:00:00.000Z" }, new Date("2026-09-01T12:00:00.000Z"));
    const session = { id: "session-fixed", gameId, sponsorId: "vendking", startedAt: "2026-09-01T12:00:00.000Z" };
    const first = settleRecGame(state, session, "request-fixed");
    const replayState = normalizeRecState({ stamina: 100, staminaUpdatedAt: "2026-09-01T12:00:00.000Z" }, new Date("2026-09-01T12:00:00.000Z"));
    const second = settleRecGame(replayState, session, "request-fixed");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(state.stamina).toBe(100 - REC_GAMES[gameId].staminaCost);
    expect(state.processed).toEqual(["request-fixed"]);
  });

  it("keeps paid consumables, alcohol, non-alcohol and rechargeable goods distinct", () => {
    expect(REC_ITEMS.some((item) => item.category === "alcoholic")).toBe(true);
    expect(REC_ITEMS.some((item) => item.category === "non_alcoholic")).toBe(true);
    expect(REC_ITEMS.some((item) => item.category === "rechargeable" && "maxCharges" in item)).toBe(true);
    expect(REC_ITEMS.every((item) => Number.isInteger(item.price) && item.price > 0)).toBe(true);
  });

  it("rejects settlement when stamina is insufficient", () => {
    const state = normalizeRecState({ stamina: 0, staminaUpdatedAt: "2026-09-01T12:00:00.000Z" }, new Date("2026-09-01T12:00:00.000Z"));
    const result = settleRecGame(state, { id: "s", gameId: "bowling", sponsorId: "vendking", startedAt: "" }, "r");
    expect(result).toEqual({ ok: false, error: "insufficient_stamina" });
    expect(state.stamina).toBe(0);
  });
});

describe("POST /api/recreation/arcade/charge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.reset(1_000);
  });

  it.each(CLASSIC_ARCADE_GAME_IDS)("debits the exact configured price for %s", async (gameId) => {
    const requestId = `charge-${gameId.replaceAll("_", "-")}`;
    const res = await request(buildArcadeApp())
      .post("/api/recreation/arcade/charge")
      .send({ slotIndex: 0, gameId, requestId });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "ok", charged: true, gameId, priceFiat: CLASSIC_ARCADE_PRICES[gameId] });
    expect(routeMocks.spendFiat).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "arcade-player",
      amountFiat: CLASSIC_ARCADE_PRICES[gameId],
      kind: "rec_arcade",
      idempotencyKey: `rec-arcade:${requestId}`,
    }));
    expect(routeMocks.state.debited).toBe(CLASSIC_ARCADE_PRICES[gameId]);
    expect(routeMocks.state.wallet).toBe(1_000 - CLASSIC_ARCADE_PRICES[gameId]);
  });

  it("does not debit twice when the same requestId is retried", async () => {
    const app = buildArcadeApp();
    const body = { slotIndex: 0, gameId: "neon_breaker", requestId: "charge-retry-1" };

    const first = await request(app).post("/api/recreation/arcade/charge").send(body);
    const retry = await request(app).post("/api/recreation/arcade/charge").send(body);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ charged: true, priceFiat: 100 });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ charged: false, priceFiat: 100 });
    expect(routeMocks.state.charges).toEqual([100]);
    expect(routeMocks.state.wallet).toBe(900);
    expect(routeMocks.spendFiat).toHaveBeenCalledTimes(2);
  });

  it("returns the exact required amount and leaves an insufficient wallet untouched", async () => {
    routeMocks.reset(49);

    const res = await request(buildArcadeApp())
      .post("/api/recreation/arcade/charge")
      .send({ slotIndex: 0, gameId: "barrel_runner", requestId: "charge-short-1" });

    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "insufficient_fiat", required: 50, spendable: 49 });
    expect(routeMocks.state.debited).toBe(0);
    expect(routeMocks.state.wallet).toBe(49);
  });

  it("rejects an unsupported cabinet ID before opening a transaction", async () => {
    const res = await request(buildArcadeApp())
      .post("/api/recreation/arcade/charge")
      .send({ slotIndex: 0, gameId: "pacman", requestId: "charge-invalid-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/classic game/i);
    expect(routeMocks.spendFiat).not.toHaveBeenCalled();
  });
});