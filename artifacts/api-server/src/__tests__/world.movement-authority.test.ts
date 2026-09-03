import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUTHENTICATED_CITY_SPAWN,
  PLAYER_IDLE_SLEEP_MS,
  shouldMarkPlayerSleeping,
  authoritativePositionForPlayer,
  handleMessage,
  validateAuthenticatedMovement,
  WORLD_BOUNDS,
} from "../worldServer";

describe("authenticated world movement authority", () => {
  const source = readFileSync(new URL("../worldServer.ts", import.meta.url), "utf8");
  it("rejects non-finite and out-of-bounds coordinates", () => {
    expect(validateAuthenticatedMovement({ x: 100, y: 100 }, { x: Number.NaN, y: 100 }, 100)).toBe(false);
    expect(validateAuthenticatedMovement({ x: 100, y: 100 }, { x: 100, y: Number.POSITIVE_INFINITY }, 100)).toBe(false);
    expect(validateAuthenticatedMovement({ x: 100, y: 100 }, { x: WORLD_BOUNDS.maxX + 1, y: 100 }, 100)).toBe(false);
    expect(validateAuthenticatedMovement({ x: 100, y: 100 }, { x: 100, y: WORLD_BOUNDS.minY - 1 }, 100)).toBe(false);
  });

  it("accepts a normal movement delta with latency allowance", () => {
    expect(validateAuthenticatedMovement({ x: 6400, y: 6300 }, { x: 6412, y: 6308 }, 120)).toBe(true);
  });

  it("rejects a teleport delta", () => {
    expect(validateAuthenticatedMovement({ x: 6400, y: 6300 }, { x: 7300, y: 7000 }, 120)).toBe(false);
  });

  it("rejects non-finite and out-of-bounds anonymous movement", () => {
    const player = {
      id: "anonymous-player", cityId: "minx_city", x: 100, y: 100,
      lastMoveAt: Date.now(), paused: false,
    };
    // JSON.parse accepts an overflowing numeric literal as Infinity.
    handleMessage(player as any, '{"type":"move","x":1e999,"y":200}');
    expect(player).toMatchObject({ x: 100, y: 100 });
    handleMessage(player as any, JSON.stringify({ type: "move", x: WORLD_BOUNDS.maxX + 1, y: 200 }));
    expect(player).toMatchObject({ x: 100, y: 100 });
  });

  it("never lets forged interior presentation coordinates alter the authoritative exterior baseline", () => {
    const player = {
      id: "authenticated-player",
      userId: "authenticated-user",
      cityId: "minx_city",
      x: AUTHENTICATED_CITY_SPAWN.x,
      y: AUTHENTICATED_CITY_SPAWN.y,
      authoritativeX: AUTHENTICATED_CITY_SPAWN.x,
      authoritativeY: AUTHENTICATED_CITY_SPAWN.y,
      lastMoveAt: Date.now(),
      paused: false,
    };
    handleMessage(player as any, JSON.stringify({
      type: "move",
      x: 6330,
      y: 7450,
      interiorBid: "market",
    }));
    expect(player.x).toBe(6330);
    expect(player.y).toBe(7450);
    expect(authoritativePositionForPlayer(player)).toEqual(AUTHENTICATED_CITY_SPAWN);
    expect(player.authoritativeX).toBe(AUTHENTICATED_CITY_SPAWN.x);
    expect(player.authoritativeY).toBe(AUTHENTICATED_CITY_SPAWN.y);
  });

  it("emits correction messages for rejected movement", () => {
    const send = vi.fn();
    const player = {
      userId: "authenticated-user",
      cityId: "minx_city",
      x: 6400,
      y: 6300,
      authoritativeX: 6400,
      authoritativeY: 6300,
      lastMoveAt: Date.now(),
      ws: { send },
    };
    handleMessage(player as any, JSON.stringify({ type: "move", x: 9000, y: 9000 }));
    expect(send).toHaveBeenCalledWith(JSON.stringify({
      type: "position_correction",
      x: 6400,
      y: 6300,
    }));
  });

  it("keeps sleeping presence explicit while preserving the paused state", () => {
    const player = {
      id: "sleeping-player",
      cityId: "minx_city",
      x: 6400,
      y: 6300,
      lastMoveAt: Date.now(),
      paused: false,
      sleeping: false,
    };
    handleMessage(player as any, JSON.stringify({ type: "move", x: 6400, y: 6300, paused: true, sleeping: true }));
    expect(player).toMatchObject({ paused: true, sleeping: true });
    handleMessage(player as any, JSON.stringify({ type: "move", x: 6400, y: 6300, paused: false, sleeping: false }));
    expect(player).toMatchObject({ paused: false, sleeping: false });
    expect(PLAYER_IDLE_SLEEP_MS).toBeGreaterThan(0);
    expect(shouldMarkPlayerSleeping(40_000, 40_000 + PLAYER_IDLE_SLEEP_MS)).toBe(true);
    expect(shouldMarkPlayerSleeping(40_000, 40_000 + PLAYER_IDLE_SLEEP_MS - 1)).toBe(false);
  });

  it("loads or creates persisted authenticated positions before admission", () => {
    expect(source).toMatch(/worldPlayerPositionsTable[\s\S]{0,1200}AUTHENTICATED_CITY_SPAWN[\s\S]{0,800}const player: Player/);
  });

  it("keeps the canonical authenticated spawn inside world bounds", () => {
    expect(AUTHENTICATED_CITY_SPAWN.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
    expect(AUTHENTICATED_CITY_SPAWN.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
    expect(AUTHENTICATED_CITY_SPAWN.y).toBeGreaterThanOrEqual(WORLD_BOUNDS.minY);
    expect(AUTHENTICATED_CITY_SPAWN.y).toBeLessThanOrEqual(WORLD_BOUNDS.maxY);
  });

  it("uses the Tower arrival apron as the new-user fallback", () => {
    expect(AUTHENTICATED_CITY_SPAWN).toEqual({ x: 6400, y: 5910 });
  });
});