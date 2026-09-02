import { describe, expect, it } from "vitest";
import { SHADOW_TOWER_LISTINGS, consolidateShadowTowerBots, getMezzaninePlan, getRecreationPlan, getRestFloorPlan, getShadowTowerPlan, selectShadowTowerArchetype, validateShadowTowerPlan } from "./shadow-tower";

describe("Shadow Tower contract", () => {
  it("keeps catalog and numbered plans faithful", () => {
    expect(Object.keys(SHADOW_TOWER_LISTINGS)).toEqual(["founder_team", "company"]);
    const plan = getShadowTowerPlan("minx_city", 12, "founder_team");
    expect(plan.floorNumber).toBe(12);
    expect(plan.objects.filter((item) => item.kind === "office_unit")).toHaveLength(4);
    expect(plan.objects.filter((item) => item.kind === "workstation")).toHaveLength(0);
    expect(plan.objects.filter((item) => item.kind === "terminal")).toHaveLength(0);
    expect(plan.objects.filter((item) => item.kind === "atm")).toHaveLength(1);
    expect(plan.objects.filter((item) => item.kind === "vending_machine")).toHaveLength(1);
    expect(validateShadowTowerPlan(plan).ok).toBe(true);
  });
  it("makes settled workstation upgrades visible", () => {
    const base = getShadowTowerPlan("huda_city", 2, "company");
    const upgraded = getShadowTowerPlan("huda_city", 2, "company", ["extra_workstations", "operations_terminal", "secure_access"]);
    expect(upgraded.upgrades).toContain("secure_access");
    expect(upgraded.objects.filter((item) => item.kind === "workstation").length).toBe(4);
    expect(upgraded.objects.filter((item) => item.kind === "terminal")).toHaveLength(1);
  });
  it("selects only valid plans and consolidates canonically", () => {
    expect(selectShadowTowerArchetype(4, 2)).toBe("founder_team");
    expect(selectShadowTowerArchetype(5, 2)).toBe("company");
    expect(consolidateShadowTowerBots([{ id: 9, department: "ops", permissions: ["b", "a"] }, { id: 2, department: "ops", permissions: ["a", "b"] }])).toEqual([{ purpose: "ops", permissionSignature: "a,b", canonicalBotId: 2, botIds: [2, 9] }]);
  });
  it("provides a validated public REC plan with seven distinct stations", () => {
    const plan = getRecreationPlan("huda_city");
    expect(plan.floorType).toBe("recreation");
    expect(plan.objects.filter((item) => item.kind === "rec_station").map((item) => item.id)).toHaveLength(7);
    expect(validateShadowTowerPlan(plan).ok).toBe(true);
  });
  it("provides fixed, validated public work and rest floors", () => {
    const mezzanine = getMezzaninePlan("minx_city");
    const rest = getRestFloorPlan("huda_city");
    expect(mezzanine).toMatchObject({ floorType: "mezzanine", floorNumber: 2 });
    expect(rest).toMatchObject({ floorType: "rest", floorNumber: 3 });
    expect(validateShadowTowerPlan(mezzanine).ok).toBe(true);
    expect(validateShadowTowerPlan(rest).ok).toBe(true);
    expect(mezzanine.objects.filter((item) => item.kind === "work_board")).toHaveLength(1);
    expect(rest.objects.filter((item) => item.kind === "bed").length).toBeGreaterThanOrEqual(4);
  });
});