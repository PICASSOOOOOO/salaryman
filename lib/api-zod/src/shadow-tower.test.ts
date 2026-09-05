import { describe, expect, it } from "vitest";
import {
  SHADOW_TOWER_LISTINGS,
  consolidateShadowTowerBots,
  getMezzaninePlan,
  getRecreationPlan,
  getRestFloorPlan,
  getShadowTowerCommercialFloor,
  getShadowTowerCommercialTenants,
  getShadowTowerPlan,
  selectShadowTowerArchetype,
  validateShadowTowerPlan,
  withShadowTowerTenantFitout,
} from "./shadow-tower";

describe("Shadow Tower contract", () => {
  it("keeps catalog and numbered plans faithful", () => {
    expect(Object.keys(SHADOW_TOWER_LISTINGS)).toEqual(["founder_team", "company"]);
    const plan = getShadowTowerPlan("minx_city", 12, "founder_team");
    expect(plan.floorNumber).toBe(12);
    expect(plan.objects.filter((item) => item.kind === "office_unit")).toHaveLength(1);
    expect(plan.objects.filter((item) => item.kind === "workstation")).toHaveLength(0);
    expect(plan.objects.filter((item) => item.kind === "terminal")).toHaveLength(1);
    expect(plan.objects.filter((item) => item.kind === "executive_desk")).toHaveLength(1);
    expect(plan.objects.filter((item) => item.kind === "atm")).toHaveLength(1);
    expect(plan.objects.filter((item) => item.kind === "vending_machine")).toHaveLength(1);
    expect(validateShadowTowerPlan(plan).ok).toBe(true);
  });

  it("serializes the elevator circulation core and password-protected suite doors", () => {
    const plan = getShadowTowerPlan("huda_city", 44, "company", [], 4);
    const hall = plan.objects.find((item) => item.kind === "elevator_hall");
    const elevator = plan.objects.find((item) => item.kind === "elevator");
    const suites = plan.objects.filter((item) => item.kind === "office_unit");
    expect(hall?.footprint).toMatchObject({ x: 0, y: 0, cols: 4, rows: 8 });
    expect(elevator?.footprint.x).toBe(0);
    expect(suites).toHaveLength(4);
    expect(suites.every((item) => item.footprint.y === 0 && item.door?.access === "password")).toBe(true);
    expect(validateShadowTowerPlan(plan)).toMatchObject({ ok: true });
  });
  it("makes settled workstation upgrades visible", () => {
    const base = getShadowTowerPlan("huda_city", 2, "company");
    const upgraded = getShadowTowerPlan("huda_city", 2, "company", ["extra_workstations", "operations_terminal", "secure_access"]);
    expect(upgraded.upgrades).toContain("secure_access");
    expect(upgraded.objects.filter((item) => item.kind === "workstation").length).toBe(4);
    expect(upgraded.objects.filter((item) => item.kind === "terminal")).toHaveLength(2);
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

  it("assigns catalog tenants to their exact commercial suites", () => {
    const floor = getShadowTowerCommercialFloor(18);
    expect(floor.status).toBe("occupied");
    expect(floor.tenants.map((tenant) => tenant.businessKey)).toEqual(["tower_doctor", "tower_dentist"]);
    expect(floor.tenants.map((tenant) => tenant.unitNumber)).toEqual([1, 2]);
    expect(floor.tenants.every((tenant) => tenant.floorNumber === 18)).toBe(true);
    expect(floor.tenants.every((tenant) => tenant.service.settlementPath === "/business/services")).toBe(true);
    expect(floor.tenants.map((tenant) => tenant.conversation.businessName)).toEqual([
      "VALE PRIVATE MEDICINE",
      "BITE//BYTE DENTAL",
    ]);
    expect(floor.tenants.every((tenant) => tenant.conversation.service === tenant.business.service)).toBe(true);
    expect(floor.tenants.every((tenant) => tenant.conversation.offer === tenant.business.ad)).toBe(true);
  });

  it("keeps an unassigned commercial floor truthful and adds no occupants", () => {
    expect(getShadowTowerCommercialTenants(13)).toEqual([]);
    expect(getShadowTowerCommercialFloor(13)).toMatchObject({ status: "vacant", tenants: [] });
    const plan = getShadowTowerPlan("minx_city", 13, "founder_team");
    const projected = withShadowTowerTenantFitout(plan, []);
    expect(projected.objects.some((object) => object.kind === "tenant_station")).toBe(false);
    expect(validateShadowTowerPlan(projected).ok).toBe(true);
  });

  it("keeps tenant stations in the authoritative collision plan", () => {
    const tenants = getShadowTowerCommercialTenants(18);
    const plan = withShadowTowerTenantFitout(
      getShadowTowerPlan("huda_city", 18, "company", [], tenants.length),
      tenants.map((tenant) => tenant.businessKey),
    );
    const stations = plan.objects.filter((object) => object.kind === "tenant_station");
    expect(stations).toHaveLength(2);
    expect(plan.collisionFootprints).toEqual(expect.arrayContaining(stations.map((station) => station.footprint)));
    expect(validateShadowTowerPlan(plan).ok).toBe(true);
  });
});