import { describe, expect, it } from "vitest";
import {
  ECOSYSTEM_CONDITION_PROFILES,
  PET_SPECIES,
  getConditionMetricDirection,
  isConditionMetricAllowed,
  normalizeConditionMetric,
} from "@workspace/api-zod";
import {
  conditionStateFromScore,
  deriveConditionProfile,
  repairConditionScore,
} from "../lib/world-condition";

describe("ecosystem condition profiles", () => {
  it("keeps human, replicant, pet, vehicle, and facility needs distinct", () => {
    expect(ECOSYSTEM_CONDITION_PROFILES.human.primaryMetrics).toEqual(["netWorth", "stamina"]);
    expect(ECOSYSTEM_CONDITION_PROFILES.replicant.primaryMetrics).toEqual(["netWorth", "battery"]);
    expect(ECOSYSTEM_CONDITION_PROFILES.pet.careCadence).toBe("forgiving");
    expect(ECOSYSTEM_CONDITION_PROFILES.vehicle.useContext).toBe("outside_world");
    expect(ECOSYSTEM_CONDITION_PROFILES.utility.secondaryMetrics).toEqual(["electrical", "gas", "water"]);
    expect(PET_SPECIES).toContain("water_buffalo");
    expect(PET_SPECIES).toContain("dolphin");
  });

  it("validates each profile's metrics and preserves unbounded net worth", () => {
    expect(isConditionMetricAllowed("human", "stamina")).toBe(true);
    expect(isConditionMetricAllowed("replicant", "stamina")).toBe(false);
    expect(getConditionMetricDirection("human", "stress")).toBe("higher_is_worse");
    expect(normalizeConditionMetric("human", "netWorth", 1_000_000_000_000)).toBe(1_000_000_000_000);
    expect(normalizeConditionMetric("human", "stamina", 150)).toBe(100);
    expect(normalizeConditionMetric("human", "stamina", 45.9)).toBe(45);
    expect(normalizeConditionMetric("human", "unknown", 50)).toBeNull();
    expect(normalizeConditionMetric("human", "stamina", Number.NaN)).toBeNull();
  });
});

describe("world condition drift", () => {
  const now = Date.UTC(2026, 0, 1);

  it("moves from maintained care to weathered and neglected over months, not minutes", () => {
    expect(conditionStateFromScore(100)).toBe("flourishing");
    expect(deriveConditionProfile(100, now, now + 10 * 86_400_000).state).toBe("flourishing");
    expect(deriveConditionProfile(100, now, now + 120 * 86_400_000).state).toBe("weathered");
    expect(deriveConditionProfile(100, now, now + 300 * 86_400_000).state).toBe("neglected");
  });

  it("keeps the same physical asset readable while condition cues change", () => {
    const baseline = deriveConditionProfile(100, now, now);
    const rotting = deriveConditionProfile(10, now, now);
    expect(baseline.cues.repairAction).not.toBe(rotting.cues.repairAction);
    expect(rotting.cues.structure).toContain("unsafe");
  });

  it("lets bounded repair work move a place back toward care", () => {
    const before = deriveConditionProfile(42, now - 240 * 86_400_000, now);
    const repair = repairConditionScore(42, now - 240 * 86_400_000, 4, now);
    expect(repair.repairedScore).toBeGreaterThan(before.score);
    expect(repair.profile.score).toBe(repair.repairedScore);
    expect(repair.profile.daysSinceMaintenance).toBe(0);
  });
});