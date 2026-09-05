import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";

const { getPlayerPosition } = vi.hoisted(() => ({ getPlayerPosition: vi.fn() }));
vi.mock("../worldServer", () => ({ getPlayerPosition }));

import worldEconomyRouter, {
  isNearJobBuilding,
  isQuoteLocationAuthorized,
  locationForLivePlayer,
  MINIMUM_WAGE_FIAT_PER_HOUR,
  QUICK_JOBS,
  STANDARD_SHIFT_MS,
} from "../routes/gameplay-world-economy";

describe("authoritative world economy location gates", () => {
  const source = readFileSync(new URL("../routes/gameplay-world-economy.ts", import.meta.url), "utf8");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = { id: "world-economy-test-user" };
    next();
  });
  app.use(worldEconomyRouter);

  beforeEach(() => getPlayerPosition.mockReset());

  it("ignores a forged market location body when no canonical live position exists", async () => {
    getPlayerPosition.mockReturnValue(null);
    const response = await request(app).post("/gameplay/market/quote").send({
      slot: 0, location: "waste", commodityId: "data", side: "buy", quantity: 1,
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("market_location_required");
  });

  it("rejects a live player who is outside both canonical market ranges", async () => {
    getPlayerPosition.mockReturnValue({ x: 1, y: 1 });
    const response = await request(app).post("/gameplay/market/quote").send({
      slot: 0, location: "city", commodityId: "scrap", side: "sell", quantity: 1,
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("market_location_required");
  });

  it("rejects remote quick-job start requests", async () => {
    getPlayerPosition.mockReturnValue({ x: 1, y: 1 });
    const response = await request(app).post("/gameplay/jobs/start").send({
      slot: 0, jobId: "scrap", idempotencyKey: "remote-job-request",
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("job_location_required");
  });

  it("keeps watering plants as the lowest-paid always-available quick job", () => {
    expect(QUICK_JOBS.water_plants).toEqual({
      buildingId: "water_plants",
      label: "WATER PLANTS",
      payFiat: MINIMUM_WAGE_FIAT_PER_HOUR,
      durationMs: STANDARD_SHIFT_MS,
      cooldownMs: 10_000,
    });
    expect(MINIMUM_WAGE_FIAT_PER_HOUR).toBe(300);
    expect(STANDARD_SHIFT_MS).toBe(60_000);
  });

  it("authorizes watering plants only at the canonical garden location", () => {
    getPlayerPosition.mockReturnValue({ x: 6120, y: 7450 });
    expect(isNearJobBuilding("world-economy-test-user", "water_plants")).toBe(true);

    getPlayerPosition.mockReturnValue({ x: 1, y: 1 });
    expect(isNearJobBuilding("world-economy-test-user", "water_plants")).toBe(false);
  });

  it("keeps completion settlement idempotent and cooldown-protected", () => {
    expect(source).toMatch(/if \(run\.completedAt\)[\s\S]{0,500}duplicate: true/);
    expect(source).toMatch(/cooldownUntil[\s\S]{0,220}cooldown/);
  });

  it("detects leaving the quoted exchange and checks it before cargo or wallet work", () => {
    getPlayerPosition.mockReturnValue({ x: 6330, y: 7520 });
    expect(locationForLivePlayer("world-economy-test-user")).toBe("waste");
    expect(isQuoteLocationAuthorized("world-economy-test-user", "city")).toBe(false);
    expect(source).toMatch(
      /isQuoteLocationAuthorized\(userId, quote\.location\)[\s\S]{0,250}const cargoRows/,
    );
  });
});