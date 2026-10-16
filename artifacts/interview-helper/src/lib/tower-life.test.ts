import { describe, expect, it } from "vitest";
import { TOWER_INFRASTRUCTURE_BUSINESSES } from "@workspace/api-zod";
import { getShadowTowerCommercialTenants } from "@workspace/api-zod/shadow-tower";
import {
  getTowerAmbientOccupants,
  createTowerDailyRoutine,
  getTowerRoutineState,
  getTowerOperatorDialogue,
  getTowerOperatorDialogues,
  TOWER_BUSINESSES,
} from "./tower-life";

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

  it("gives ambient residents a concrete productive routine and optional named art", () => {
    const residents = getTowerAmbientOccupants("lobby");
    expect(residents.length).toBeGreaterThan(0);
    expect(residents.every((resident) => resident.workLabel.length > 0)).toBe(true);
    expect(residents.find((resident) => resident.name === "CLAW PRIME")?.artSrc)
      .toBe("tower-art/character-claw-prime.png");
    expect(residents.find((resident) => resident.name === "FINANCE TRACKER")?.artSrc)
      .toBeUndefined();
    expect(residents.every((resident) => resident.routine.tasks.length > 0)).toBe(true);
  });

  it("derives stable day and night shifts with work, break, and off-shift states", () => {
    const errands = ["check lift permissions", "route a tenant"];
    const day = createTowerDailyRoutine(501, errands);
    const night = createTowerDailyRoutine(502, errands);
    expect(createTowerDailyRoutine(501, errands)).toEqual(day);
    expect(day.shiftStartMinute).toBeLessThan(12 * 60);
    expect(night.shiftStartMinute).toBeGreaterThanOrEqual(20 * 60);

    const shiftStart = new Date(2026, 0, 1, Math.floor(day.shiftStartMinute / 60), day.shiftStartMinute % 60);
    expect(getTowerRoutineState(day, shiftStart).phase).toBe("on_shift");
    const breakMinute = day.shiftStartMinute + day.breakOffsetMinutes + 5;
    expect(getTowerRoutineState(day, new Date(
      2026, 0, 1, Math.floor(breakMinute / 60), breakMinute % 60,
    )).phase).toBe("meal_break");
    expect(getTowerRoutineState(day, new Date(2026, 0, 1, 19, 0)).phase).toBe("off_shift");
    expect(getTowerRoutineState(night, new Date(2026, 0, 1, 23, 0)).phase).toBe("on_shift");
  });

  it("projects only catalog-backed commercial residents onto occupied floors", () => {
    expect(getTowerAmbientOccupants(18).map((occupant) => occupant.name)).toEqual([
      "VALE PRIVATE MEDICINE OPERATOR",
      "BITE//BYTE DENTAL OPERATOR",
    ]);
    expect(getTowerAmbientOccupants(13)).toEqual([]);
  });

  it("gives each occupied resident a catalog-backed conversation", () => {
    const tenants = getShadowTowerCommercialTenants(18);
    const dialogues = getTowerOperatorDialogues(18);
    expect(dialogues).toHaveLength(tenants.length);
    expect(dialogues.map((dialogue) => dialogue.residentName)).toEqual(
      tenants.map((tenant) => tenant.resident.name),
    );
    for (const [index, dialogue] of dialogues.entries()) {
      const tenant = tenants[index];
      expect(dialogue.businessName).toBe(tenant.business.name);
      expect(dialogue.role).toBe(tenant.resident.role);
      expect(dialogue.service).toBe(tenant.business.service);
      expect(dialogue.offer).toBe(tenant.business.ad);
      expect(dialogue.lines).toEqual([
        `Welcome to ${tenant.business.name}.`,
        `I am the ${tenant.resident.role.toLowerCase()} on this floor.`,
        `Our current offer is ${tenant.business.service.toLowerCase()}. ${tenant.business.ad}`,
      ]);
    }
  });

  it("keeps operator dialogue unavailable on vacant and non-commercial floors", () => {
    expect(getTowerOperatorDialogues(13)).toEqual([]);
    expect(getTowerOperatorDialogues("lobby")).toEqual([]);
    expect(getTowerOperatorDialogue(undefined)).toBeNull();
  });
});