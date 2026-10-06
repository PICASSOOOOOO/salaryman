import { describe, expect, it } from "vitest";
import {
  decayBuildingScore,
  needsPublicMaintenance,
  publicMaintenanceDurationMs,
  publicMaintenanceReward,
  publicMaintenanceSlotLimit,
  workProgress,
} from "../lib/maintenance-policy";

describe("Tower public maintenance policy", () => {
  it("decays object scores after a short grace period and never below zero", () => {
    const lastMaintainedAt = new Date("2026-01-01T00:00:00.000Z");
    const afterGrace = new Date("2026-01-05T00:00:00.000Z").getTime();
    expect(decayBuildingScore(80, lastMaintainedAt, 2, afterGrace)).toBe(78);
    expect(decayBuildingScore(1, lastMaintainedAt, 2, afterGrace + 365 * 86_400_000)).toBe(0);
  });

  it("offers public work only for objects that need attention", () => {
    expect(needsPublicMaintenance(70)).toBe(true);
    expect(needsPublicMaintenance(71)).toBe(false);
  });

  it("keeps every public job payout at or below the ƒ100 task cap", () => {
    expect(publicMaintenanceReward(70)).toBe(25);
    expect(publicMaintenanceReward(35)).toBe(75);
    expect(publicMaintenanceReward(0)).toBe(100);
  });

  it("offers more concurrent work when residents are less wealthy or less involved", () => {
    const highNeed = publicMaintenanceSlotLimit({
      recentResidents: 10,
      recentWorkerResidents: 0,
      averageFiatWealth: 0,
    });
    const lowNeed = publicMaintenanceSlotLimit({
      recentResidents: 10,
      recentWorkerResidents: 3,
      averageFiatWealth: 100_000,
    });
    expect(highNeed).toBe(10);
    expect(lowNeed).toBe(2);
  });

  it("bounds work duration and reports elapsed progress", () => {
    expect(publicMaintenanceDurationMs("clean", 0)).toBeLessThanOrEqual(10_000);
    expect(workProgress(new Date(1_000), 4_000, 3_000)).toBe(0.5);
    expect(workProgress(new Date(1_000), 4_000, 10_000)).toBe(1);
  });
});
