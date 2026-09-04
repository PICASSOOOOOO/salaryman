import { describe, expect, it } from "vitest";
import { SHADOW_TOWER_LISTINGS, getShadowTowerPlan, validateShadowTowerPlan } from "@workspace/api-zod/shadow-tower";
import {
  findOfficeRoute, getOfficeBlockedTiles, getShadowTowerOfficeLayout,
  officePropertyLayoutFromPlan, routeOfficePath, validateOfficePose,
} from "./office-property-layouts";
import { getTowerAmbientOccupants } from "./tower-life";

describe("Shadow Tower office projection", () => {
  it("projects every shared plan object without adding legacy geometry", () => {
    for (const archetype of Object.keys(SHADOW_TOWER_LISTINGS) as Array<keyof typeof SHADOW_TOWER_LISTINGS>) {
      const plan = getShadowTowerPlan("minx_city", 17, archetype);
      const layout = officePropertyLayoutFromPlan(plan);
      expect(layout.cols).toBe(plan.cols);
      expect(layout.rows).toBe(plan.rows);
      expect(layout.teamDesks.map(d => d.id)).toEqual(plan.objects.filter(o => o.kind === "workstation").map(o => o.id));
      expect(layout.stations.map(s => s.id)).toEqual(plan.objects.filter(o => o.interactive && o.kind !== "workstation" && o.kind !== "executive_desk").map(o => o.id));
      expect(layout.playerDesk?.id).toBe("executive-desk");
      for (const station of layout.stations) {
        const object = plan.objects.find(candidate => candidate.id === station.id)!;
        expect(station.footprint).toEqual({ w: object.footprint.cols, d: object.footprint.rows });
      }
    }
  });

  it("starts each listing with one executive suite", () => {
    for (const [archetype, listing] of Object.entries(SHADOW_TOWER_LISTINGS) as Array<[keyof typeof SHADOW_TOWER_LISTINGS, typeof SHADOW_TOWER_LISTINGS.founder_team]>) {
      expect(getShadowTowerPlan("huda_city", 44, archetype).objects.filter(o => o.kind === "office_unit")).toHaveLength(1);
      expect(getShadowTowerPlan("huda_city", 44, archetype).objects.filter(o => o.kind === "executive_desk")).toHaveLength(1);
    }
  });

  it("keeps exact collisions and all interactive objects reachable", () => {
    const plan = getShadowTowerPlan("minx_city", 2, "company", ["extra_workstations", "operations_terminal"]);
    expect(validateShadowTowerPlan(plan)).toMatchObject({ ok: true });
    const layout = officePropertyLayoutFromPlan(plan);
    const blocked = getOfficeBlockedTiles(layout);
    expect(blocked.size).toBeGreaterThan(0);
    expect(validateOfficePose(layout, layout.spawn)).toEqual(layout.spawn);
    const route = findOfficeRoute(layout, { col: plan.spawn.x, row: plan.spawn.y }, { col: 3, row: 6 });
    expect(route.length).toBeGreaterThan(0);
    route.forEach(tile => expect(blocked.has(`${tile.col},${tile.row}`)).toBe(false));
  });

  it("routes a tap on solid furniture to its nearest reachable walk-up tile", () => {
    const plan = getShadowTowerPlan("minx_city", 2, "company");
    const layout = officePropertyLayoutFromPlan(plan);
    const blocked = getOfficeBlockedTiles(layout);
    const vending = plan.objects.find((object) => object.kind === "vending_machine")!;
    const blockedCenter = {
      col: vending.footprint.x + Math.floor(vending.footprint.cols / 2),
      row: vending.footprint.y + Math.floor(vending.footprint.rows / 2),
    };
    expect(blocked.has(`${blockedCenter.col},${blockedCenter.row}`)).toBe(true);
    const route = findOfficeRoute(layout, { col: plan.spawn.x, row: plan.spawn.y }, blockedCenter);
    expect(route.length).toBeGreaterThan(0);
    const destination = route.at(-1)!;
    expect(blocked.has(`${destination.col},${destination.row}`)).toBe(false);
    expect(Math.hypot(destination.col - blockedCenter.col, destination.row - blockedCenter.row)).toBeLessThanOrEqual(2);
  });

  it("exposes upgrade objects and extra workstations from the same plan", () => {
    const layout = getShadowTowerOfficeLayout("huda_city", 9, "founder_team", ["extra_workstations", "operations_terminal"]);
    expect(layout.teamDesks).toHaveLength(4);
    expect(layout.stations.map(station => station.id)).toContain("operations-terminal");
  });

  it("projects Tower resident paths through solid floor geometry", () => {
    const layout = officePropertyLayoutFromPlan(getSecurityPlanForTest());
    const blocked = getOfficeBlockedTiles(layout);
    for (const occupant of getTowerAmbientOccupants(4)) {
      const path = routeOfficePath(layout, occupant.path ?? [{ col: occupant.col, row: occupant.row }]);
      for (const tile of path) expect(blocked.has(`${tile.col},${tile.row}`)).toBe(false);
    }
  });
});

function getSecurityPlanForTest() {
  return getShadowTowerPlan("minx_city", 4, "founder_team");
}