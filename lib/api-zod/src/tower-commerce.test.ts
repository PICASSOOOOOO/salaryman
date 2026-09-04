import { describe, expect, it } from "vitest";
import {
  SHADOW_TOWER_MAX_OFFICE_UNITS,
  getTowerBusinessConversation,
  getTowerBusinessPlacement,
  sortTowerBusinessesByExitPriority,
  TOWER_INFRASTRUCTURE_BUSINESSES,
} from "./index";

describe("Tower business exit placement", () => {
  it("keeps every catalog business uniquely addressable", () => {
    const keys = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.key);
    const tickers = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.ticker);
    const codes = TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.code);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tickers).size).toBe(tickers.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("assigns fixed-suite businesses to stable units within the four-unit floor contract", () => {
    const byFloor = new Map<number, number[]>();
    for (const business of TOWER_INFRASTRUCTURE_BUSINESSES) {
      const placement = getTowerBusinessPlacement(business);
      if (placement?.floorNumber != null && placement.unitNumber != null) {
        byFloor.set(placement.floorNumber, [...(byFloor.get(placement.floorNumber) ?? []), placement.unitNumber]);
      }
    }
    for (const units of byFloor.values()) {
      expect(units.length).toBeLessThanOrEqual(SHADOW_TOWER_MAX_OFFICE_UNITS);
      expect(new Set(units).size).toBe(units.length);
    }
  });

  it("ranks numbered floors from the exit upward without promoting lobby businesses", () => {
    const ranked = sortTowerBusinessesByExitPriority();
    const priorities = ranked
      .map((business) => getTowerBusinessPlacement(business)?.exitPriority)
      .filter((priority): priority is number => priority != null);
    expect(priorities.length).toBeGreaterThan(0);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    expect(getTowerBusinessPlacement("lobby_gift_shop")?.exitPriority).toBeNull();
    expect(getTowerBusinessPlacement("tower_restaurant")?.exitPriority).toBe(12);
  });

  it("derives operator conversation fields from the canonical catalog", () => {
    const business = TOWER_INFRASTRUCTURE_BUSINESSES.find((item) => item.key === "tower_doctor")!;
    expect(getTowerBusinessConversation(business)).toEqual({
      businessName: business.name,
      role: `${business.category.toUpperCase()} · ${business.operatorCode}`,
      service: business.service,
      offer: business.ad,
    });
    expect(getTowerBusinessConversation("missing-business")).toBeNull();
  });
});