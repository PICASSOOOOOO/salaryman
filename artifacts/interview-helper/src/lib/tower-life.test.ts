import { describe, expect, it } from "vitest";
import { TOWER_INFRASTRUCTURE_BUSINESSES } from "@workspace/api-zod";
import { getTowerAmbientOccupants, TOWER_BUSINESSES } from "./tower-life";

describe("Tower Life operating catalog", () => {
  it("keeps every canonical business operationally described", () => {
    expect(TOWER_BUSINESSES.map((business) => business.key)).toEqual(
      TOWER_INFRASTRUCTURE_BUSINESSES.map((business) => business.key),
    );
    for (const business of TOWER_BUSINESSES) {
      expect(business.playerService.length).toBeGreaterThan(0);
      expect(business.playerJob.length).toBeGreaterThan(0);
      expect(business.rewardFiat).toBeGreaterThan(0);
      expect(business.storyHook.length).toBeGreaterThan(0);
      expect(business.artDirection.length).toBeGreaterThan(0);
    }
  });

  it("places traveling operators on the public floors they service", () => {
    const floorTwo = getTowerAmbientOccupants(2).map((occupant) => occupant.name);
    const floorThree = getTowerAmbientOccupants(3).map((occupant) => occupant.name);
    expect(floorTwo).toContain("MENDER-9");
    expect(floorTwo).toContain("WARD 67");
    expect(floorThree).toContain("MENDER-9");
    expect(floorThree).toContain("WARD 67");
  });

  it("projects only catalog-backed commercial residents onto occupied floors", () => {
    expect(getTowerAmbientOccupants(18).map((occupant) => occupant.name)).toEqual([
      "VALE PRIVATE MEDICINE OPERATOR",
      "BITE//BYTE DENTAL OPERATOR",
    ]);
    expect(getTowerAmbientOccupants(13)).toEqual([]);
  });
});