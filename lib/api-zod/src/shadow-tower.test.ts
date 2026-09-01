import { describe, expect, it } from "vitest";
import { SHADOW_TOWER_LISTINGS, consolidateShadowTowerBots, getShadowTowerPlan, selectShadowTowerArchetype, validateShadowTowerPlan } from "./shadow-tower";

describe("Shadow Tower contract", () => {
  it("keeps catalog and numbered plans faithful", () => {
    expect(Object.keys(SHADOW_TOWER_LISTINGS)).toEqual(["founder_team", "company"]);
    const plan = getShadowTowerPlan("minx_city", 12, "founder_team");
    expect(plan.floorNumber).toBe(12);
    expect(plan.objects.filter((item) => item.kind === "workstation")).toHaveLength(SHADOW_TOWER_LISTINGS.founder_team.capacity);
    expect(validateShadowTowerPlan(plan).ok).toBe(true);
  });
  it("makes settled workstation upgrades visible", () => {
    const base = getShadowTowerPlan("huda_city", 2, "company");
    const upgraded = getShadowTowerPlan("huda_city", 2, "company", ["extra_workstations", "operations_terminal", "secure_access"]);
    expect(upgraded.upgrades).toContain("secure_access");
    expect(upgraded.objects.filter((item) => item.kind === "workstation").length).toBe(base.objects.filter((item) => item.kind === "workstation").length + 4);
    expect(upgraded.objects.filter((item) => item.kind === "terminal")).toHaveLength(2);
  });
  it("selects only valid plans and consolidates canonically", () => {
    expect(selectShadowTowerArchetype(4, 2)).toBe("founder_team");
    expect(selectShadowTowerArchetype(5, 2)).toBe("company");
    expect(consolidateShadowTowerBots([{ id: 9, department: "ops", permissions: ["b", "a"] }, { id: 2, department: "ops", permissions: ["a", "b"] }])).toEqual([{ purpose: "ops", permissionSignature: "a,b", canonicalBotId: 2, botIds: [2, 9] }]);
  });
});