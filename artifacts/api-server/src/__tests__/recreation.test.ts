import { describe, expect, it } from "vitest";
import {
  CLASSIC_ARCADE_GAME_IDS, CLASSIC_ARCADE_PRICES, REC_GAME_IDS, REC_GAMES, REC_ITEMS, isClassicArcadeGameId, normalizeRecState, settleRecGame,
} from "../lib/recreation";

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