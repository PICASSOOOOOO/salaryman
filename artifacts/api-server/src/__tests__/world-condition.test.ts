import { describe, expect, it } from "vitest";
import {
  conditionStateFromScore,
  deriveConditionProfile,
  repairConditionScore,
} from "../lib/world-condition";

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