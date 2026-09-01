import {
  getRecreationPlan,
  getMezzaninePlan,
  getRestFloorPlan,
  getSecurityPlan,
  getShadowTowerPlan,
  type ShadowTowerArchetype,
  type ShadowTowerCity,
  type ShadowTowerPlan,
} from "@workspace/api-zod/shadow-tower";
import type { OfficeCapsule, OfficeDesk, OfficeFloorRect, OfficeRoom, OfficeStation } from "@/components/office/office-types";

export type OfficeFacing = "left" | "right";
export type OfficePose = { x: number; y: number; facing: OfficeFacing };

/** Renderer-ready projection of the shared Shadow Tower plan. No furniture is invented here. */
export interface OfficePropertyLayout {
  propertyKey: string;
  label: string;
  representation: string;
  cols: number;
  rows: number;
  deskCols: number;
  deskRows: number;
  capsules: number;
  spawn: OfficePose;
  playerDesk: OfficeDesk;
  teamDesks: OfficeDesk[];
  capsuleSpots: OfficeCapsule[];
  stations: Omit<OfficeStation, "onInteract">[];
  rooms: OfficeRoom[];
  plan: ShadowTowerPlan;
}

const glyphFor = (kind: string): OfficeStation["glyph"] =>
  kind === "elevator" ? "elevator" :
    kind === "atm" ? "atm" :
      kind === "vending_machine" ? "vending" :
        kind === "radio" ? "music" :
          kind === "payphone" ? "payphone" :
            kind === "bed" ? "water_cooler" :
      kind === "nurse_station" || kind === "doctor_station" || kind === "guard_station" || kind === "holding_cell" ? "comms" :
                kind === "work_board" ? "comms" : "comms";
const labelFor = (id: string, kind: string) =>
  id === "operations-terminal" ? "OPERATIONS TERMINAL" : kind === "terminal" ? "TERMINAL" : kind === "atm" ? "ATM" :
    kind === "vending_machine" ? "VENDING" : kind === "elevator" ? "ELEVATOR" :
      kind === "radio" ? "SHADOW RADIO" : kind === "payphone" ? "PAYPHONE" :
      kind === "bed" ? "REST BED" : kind === "nurse_station" ? "NURSE" :
        kind === "doctor_station" ? "DOCTOR" : kind === "guard_station" ? "SECURITY" :
          kind === "holding_cell" ? "HOLDING CELL" : kind === "evidence_lockup" ? "EVIDENCE" :
          kind === "black_market" ? "BLACK MARKET" : kind === "secret_door" ? "SECRET DOOR" :
          kind === "work_board" ? "WORLD WORK BOARD" :
          id.startsWith("rec-") ? id.slice(4).replace(/-/g, " ").toUpperCase() : id.toUpperCase().replace(/-/g, " ");

export function officePropertyLayoutFromPlan(plan: ShadowTowerPlan, propertyKey = `${plan.city}:${plan.floorNumber}`): OfficePropertyLayout {
  const objects = plan.objects;
  const executive = objects.find((object) => object.kind === "executive_desk");
  const workstations = objects.filter((object) => object.kind === "workstation");
  if (!executive || !workstations.length) throw new Error("Shadow Tower plan requires executive desk and workstations");
  const desk = (object: typeof executive, kind: OfficeDesk["kind"]): OfficeDesk => ({
    id: object.id, kind, col: object.footprint.x, row: object.footprint.y, w: object.footprint.cols, d: object.footprint.rows,
  });
  const rooms: OfficeRoom[] = objects.filter((object) => object.kind === "executive_room").map((object) => ({
    id: object.id, label: "EXECUTIVE ROOM", x: object.footprint.x, y: object.footprint.y,
    w: object.footprint.cols, h: object.footprint.rows, doorSide: "bottom", doorSpan: object.footprint.cols,
  }));
  const stations = objects.filter((object) => object.interactive && object.kind !== "workstation" && object.kind !== "executive_desk").map((object) => ({
    id: object.id, label: labelFor(object.id, object.kind), col: object.footprint.x, row: object.footprint.y,
    // Reach the walkable tile immediately outside large collision footprints.
    // A fixed 30px radius leaves a 3x2 station's centre physically unreachable.
    radius: Math.max(30, Math.hypot(object.footprint.cols * 8, object.footprint.rows * 8) + 22),
    footprint: { w: object.footprint.cols, d: object.footprint.rows }, glyph: glyphFor(object.kind),
  }));
  const archetype = plan.floorType === "recreation" ? "RECREATION · REC"
    : plan.floorType === "mezzanine" ? "PUBLIC MEZZANINE · COMPUTER CAFE"
        : plan.floorType === "rest" ? "REST WARD · CLINIC"
        : plan.floorType === "security" ? "SECURITY FLOOR · CUSTODY"
        : workstations.length > 10 ? "COMPANY FLOOR" : "FOUNDER + TEAM FLOOR";
  return {
    propertyKey, label: archetype, representation: `${plan.city.replace("_", " ").toUpperCase()} · FLOOR ${plan.floorNumber}`,
    cols: plan.cols, rows: plan.rows, deskCols: workstations.length, deskRows: 1, capsules: 0,
    spawn: { x: plan.spawn.x * 16 + 8, y: plan.spawn.y * 16 + 8, facing: "right" },
    playerDesk: desk(executive, "player"),
    teamDesks: workstations.map((object) => desk(object, "team")),
    capsuleSpots: [],
    stations, rooms, plan,
  };
}

export function getShadowTowerOfficeLayout(city: ShadowTowerCity, floorNumber: number, archetype: ShadowTowerArchetype, upgrades: readonly string[] = []): OfficePropertyLayout {
  return officePropertyLayoutFromPlan(getShadowTowerPlan(city, floorNumber, archetype, upgrades), `${city}:${floorNumber}`);
}

export function getRecreationOfficeLayout(city: ShadowTowerCity): OfficePropertyLayout {
  return officePropertyLayoutFromPlan(getRecreationPlan(city), `${city}:recreation`);
}

export function getPublicFloorOfficeLayout(city: ShadowTowerCity, floor: 2 | 3 | 4): OfficePropertyLayout {
  const plan = floor === 2 ? getMezzaninePlan(city) : floor === 3 ? getRestFloorPlan(city) : getSecurityPlan(city);
  return officePropertyLayoutFromPlan(plan, `${city}:public:${floor}`);
}

/** Compatibility keys resolve to an archetype, never legacy geometry. */
export const DEFAULT_OFFICE_PROPERTY_KEY = "founder_team";
export const OFFICE_PROPERTY_LAYOUTS: Record<string, OfficePropertyLayout> = {
  founder_team: getShadowTowerOfficeLayout("minx_city", 1, "founder_team"),
  company: getShadowTowerOfficeLayout("minx_city", 1, "company"),
};
export function getOfficePropertyLayout(propertyKey?: string | null): OfficePropertyLayout {
  return OFFICE_PROPERTY_LAYOUTS[propertyKey === "company" ? "company" : DEFAULT_OFFICE_PROPERTY_KEY];
}

export function validateOfficePose(layout: OfficePropertyLayout, pose: unknown): OfficePose | null {
  if (!pose || typeof pose !== "object") return null;
  const p = pose as Partial<OfficePose>; const x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= layout.cols * 16 || y >= layout.rows * 16) return null;
  if (getOfficeBlockedTiles(layout).has(`${Math.floor(x / 16)},${Math.floor(y / 16)}`)) return null;
  return { x, y, facing: p.facing === "left" ? "left" : "right" };
}
function addRectTiles(set: Set<string>, rect: OfficeFloorRect) {
  for (let c = Math.floor(rect.col); c < Math.ceil(rect.col + rect.w); c++) for (let r = Math.floor(rect.row); r < Math.ceil(rect.row + rect.d); r++) set.add(`${c},${r}`);
}
export function getOfficeBlockedTiles(layout: OfficePropertyLayout): Set<string> {
  const blocked = new Set<string>();
  for (const footprint of layout.plan.collisionFootprints) addRectTiles(blocked, { id: "", col: footprint.x, row: footprint.y, w: footprint.cols, d: footprint.rows });
  return blocked;
}
export interface OfficeTile { col: number; row: number; }
export function findOfficeRoute(layout: OfficePropertyLayout, from: OfficeTile, to: OfficeTile): OfficeTile[] {
  const blocked = getOfficeBlockedTiles(layout), key = (p: OfficeTile) => `${p.col},${p.row}`;
  const start = { col: Math.max(0, Math.min(layout.cols - 1, Math.floor(from.col))), row: Math.max(0, Math.min(layout.rows - 1, Math.floor(from.row))) };
  const goal = { col: Math.max(0, Math.min(layout.cols - 1, Math.floor(to.col))), row: Math.max(0, Math.min(layout.rows - 1, Math.floor(to.row))) };
  blocked.delete(key(start)); const queue = [start], previous = new Map<string, OfficeTile | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) for (const next of [{ col: queue[i].col + 1, row: queue[i].row }, { col: queue[i].col - 1, row: queue[i].row }, { col: queue[i].col, row: queue[i].row + 1 }, { col: queue[i].col, row: queue[i].row - 1 }]) {
    if (next.col < 0 || next.row < 0 || next.col >= layout.cols || next.row >= layout.rows || blocked.has(key(next)) || previous.has(key(next))) continue;
    previous.set(key(next), queue[i]); queue.push(next);
  }
  // Taps land on what the player sees. For furniture that is usually the
  // object's solid center tile, not the walkable interaction tile beside it.
  // Resolve any blocked/unreachable tap to the closest tile the flood-fill can
  // actually reach so touch, mouse and automated walk-up behavior agree.
  const destination = previous.has(key(goal))
    ? goal
    : queue.reduce((nearest, candidate) => {
        const distance = Math.hypot(candidate.col - goal.col, candidate.row - goal.row);
        const nearestDistance = Math.hypot(nearest.col - goal.col, nearest.row - goal.row);
        return distance < nearestDistance ? candidate : nearest;
      }, start);
  const route: OfficeTile[] = []; let cursor: OfficeTile | null = destination;
  while (cursor && key(cursor) !== key(start)) { route.push(cursor); cursor = previous.get(key(cursor)) ?? null; }
  return route.reverse();
}
export const OFFICE_OBJECT_DESTINATIONS = { terminal: "/console", atm: "/game/bank", vending: "/vending?from=office", elevator: "/tower" } as const;
export type OfficeDestinationObject = keyof typeof OFFICE_OBJECT_DESTINATIONS;
export function getOfficeObjectDestination(object: OfficeDestinationObject) { return OFFICE_OBJECT_DESTINATIONS[object]; }
export function getPayphoneHubDestination() { return "/phone?tab=chat"; }
export function getOfficeHudMode(width: number): "compact" | "full" { return width < 640 ? "compact" : "full"; }
export function officePoseStorageKey(slot: string | number, propertyKey: string) { return `salaryman.office.pose.v2:${slot}:${propertyKey}`; }
export function loadOfficePose(slot: string | number, layout: OfficePropertyLayout): OfficePose {
  if (typeof window === "undefined") return layout.spawn;
  try { return validateOfficePose(layout, JSON.parse(sessionStorage.getItem(officePoseStorageKey(slot, layout.propertyKey)) || "null")) ?? layout.spawn; } catch { return layout.spawn; }
}
export function saveOfficePose(slot: string | number, layout: OfficePropertyLayout, pose: OfficePose) {
  const valid = validateOfficePose(layout, pose); if (valid && typeof window !== "undefined") sessionStorage.setItem(officePoseStorageKey(slot, layout.propertyKey), JSON.stringify(valid));
}