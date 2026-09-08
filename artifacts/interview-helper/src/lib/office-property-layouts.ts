import {
  getRecreationPlan,
  getLobbyPlan,
  getMezzaninePlan,
  getRestFloorPlan,
  getSecurityPlan,
  getShadowTowerPlan,
  withShadowTowerTenantFitout,
  type ShadowTowerArchetype,
  type ShadowTowerCity,
  type ShadowTowerCommercialTenant,
  type ShadowTowerPlan,
} from "@workspace/api-zod/shadow-tower";
import type { OfficeCapsule, OfficeDesk, OfficeFloorRect, OfficeRoom, OfficeStation } from "@/components/office/office-types";

export type OfficeFacing = "left" | "right";
export type OfficePose = { x: number; y: number; facing: OfficeFacing };

export function defaultShadowTowerOfficeName(city: ShadowTowerCity, floorNumber: number): string {
  const cityCode = city === "huda_city" ? "HUDA" : "MINX";
  return `${cityCode} · SUITE F${floorNumber}-01`;
}

/** Renderer-ready projection of the shared Shadow Tower plan and catalog fit-out. */
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
  playerDesk?: OfficeDesk;
  teamDesks: OfficeDesk[];
  capsuleSpots: OfficeCapsule[];
  stations: Omit<OfficeStation, "onInteract">[];
  rooms: OfficeRoom[];
  tenants: readonly ShadowTowerCommercialTenant[];
  plan: ShadowTowerPlan;
}

const glyphFor = (kind: string): OfficeStation["glyph"] =>
  kind === "elevator" || kind === "stairs" ? "elevator" :
    kind === "atm" ? "atm" :
      kind === "vending_machine" ? "vending" :
        kind === "radio" ? "music" :
          kind === "payphone" ? "payphone" :
            kind === "bed" ? "water_cooler" :
      kind === "nurse_station" || kind === "doctor_station" || kind === "guard_station" || kind === "holding_cell" ? "comms" :
                kind === "work_board" ? "comms" : "comms";
const labelFor = (id: string, kind: string) =>
  id.startsWith("office-wing-door-") ? "OFFICE WING" :
  id.startsWith("office-address-") ? "OFFICE ADDRESS" :
  id === "operations-terminal" ? "OPERATIONS TERMINAL" : kind === "terminal" ? "TERMINAL" : kind === "atm" ? "ATM" :
    kind === "vending_machine" ? "VENDING" : kind === "elevator" ? "ELEVATOR" : kind === "stairs" ? "STAIRS" :
      kind === "radio" ? "SHADOW RADIO" : kind === "payphone" ? "PAYPHONE" :
      kind === "bed" ? "REST BED" : kind === "nurse_station" ? "NURSE" :
        kind === "doctor_station" ? "DOCTOR" : kind === "guard_station" ? "SECURITY" :
          kind === "holding_cell" ? "HOLDING CELL" : kind === "evidence_lockup" ? "EVIDENCE" :
          kind === "black_market" ? "BLACK MARKET" : kind === "secret_door" ? "SECRET DOOR" :
          kind === "work_board" ? "WORLD WORK BOARD" :
          id.startsWith("rec-") ? id.slice(4).replace(/-/g, " ").toUpperCase() : id.toUpperCase().replace(/-/g, " ");

export function officePropertyLayoutFromPlan(
  plan: ShadowTowerPlan,
  propertyKey = `${plan.city}:${plan.floorNumber}`,
  tenants: readonly ShadowTowerCommercialTenant[] = [],
  lockOfficeEntrances = true,
): OfficePropertyLayout {
  const projectedPlan = withShadowTowerTenantFitout(plan, tenants.map((tenant) => tenant.businessKey));
  const objects = projectedPlan.objects;
  const executive = objects.find((object) => object.kind === "executive_desk");
  const workstations = objects.filter((object) => object.kind === "workstation");
  const desk = (object: { id: string; footprint: { x: number; y: number; cols: number; rows: number } }, kind: OfficeDesk["kind"]): OfficeDesk => ({
    id: object.id, kind, col: object.footprint.x, row: object.footprint.y, w: object.footprint.cols, d: object.footprint.rows,
  });
  const rooms: OfficeRoom[] = objects.filter((object) => object.kind === "elevator_hall" || object.kind === "executive_room" || object.kind === "office_unit").map((object) => {
    const unitNumber = object.kind === "office_unit" ? Number(object.id.slice(-2)) : 0;
    const tenant = tenants.find((candidate) => candidate.unitNumber === unitNumber);
    return {
    id: object.id,
    label: object.kind === "office_unit"
      ? tenant?.business.name ?? `${projectedPlan.city === "huda_city" ? "HUDA" : "MINX"} · FLOOR ${projectedPlan.floorNumber} · OFFICE ${object.id.slice(-2)}`
      : object.kind === "elevator_hall" ? "ELEVATOR HALL" : plan.floorType === "office" ? defaultShadowTowerOfficeName(plan.city, plan.floorNumber) : "EXECUTIVE ROOM",
    sub: object.kind === "office_unit"
      ? tenant ? `${tenant.fitout.label} · OCCUPIED` : "FOR SALE · LEASE"
      : undefined,
    x: object.footprint.x, y: object.footprint.y,
     w: object.footprint.cols, h: object.footprint.rows,
     doorSide: object.door?.side ?? "bottom",
     doorAt: object.door?.at,
     doorSpan: object.door?.span ?? 2,
     locked: lockOfficeEntrances && object.door != null,
     access: object.door?.access,
    accent: object.kind === "office_unit" ? tenant?.business.color ?? ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399"][unitNumber - 1] : undefined,
  };
  });
  const elevator = projectedPlan.objects.find((object) => object.kind === "elevator");
  if (elevator && !rooms.some((room) => room.id === `${elevator.id}-hall`)) {
    // The lift belongs to the shared circulation core, not to an office. Keep
    // its footprint against the outside wall and give it its own small hall
    // with a single entrance into the floor.
    rooms.unshift({
      id: `${elevator.id}-hall`,
      label: "ELEVATOR HALL",
      x: elevator.footprint.x,
      y: elevator.footprint.y,
      w: Math.max(3, elevator.footprint.cols + 1),
      h: 4,
      doorSide: "bottom",
      doorAt: elevator.footprint.x + 1,
      doorSpan: 1,
      accent: "#38bdf8",
    });
  }
  const stations = objects.filter((object) => object.interactive && object.kind !== "workstation" && object.kind !== "executive_desk").map((object) => {
    const tenant = object.businessKey ? tenants.find((candidate) => candidate.businessKey === object.businessKey) : undefined;
    return {
    id: object.id,
    label: tenant ? `${tenant.business.name} · SERVICE DESK` : object.kind === "stairs"
      ? `STAIRS ${projectedPlan.floorNumber <= 1 ? "UP · F2" : `DOWN · F${projectedPlan.floorNumber - 1}`}`
      : labelFor(object.id, object.kind),
    col: object.footprint.x,
    row: object.footprint.y,
    // Reach the walkable tile immediately outside large collision footprints.
    // A fixed 30px radius leaves a 3x2 station's centre physically unreachable.
    radius: Math.max(30, Math.hypot(object.footprint.cols * 8, object.footprint.rows * 8) + 22),
    footprint: { w: object.footprint.cols, d: object.footprint.rows }, glyph: glyphFor(object.kind),
  };
   }).concat(
     rooms.filter((room) => room.locked).map((room) => ({
       id: `${room.id}-door`,
       label: `${room.label ?? "OFFICE"} · LOCKED`,
       col: room.doorSide === "left" ? room.x : room.doorSide === "right" ? room.x + room.w - 1 : room.doorAt ?? room.x + Math.floor(room.w / 2),
       row: room.doorSide === "top" ? room.y : room.doorSide === "bottom" ? room.y + room.h - 1 : room.doorAt ?? room.y + Math.floor(room.h / 2),
       radius: 30,
       footprint: { w: 1, d: 1 },
       glyph: undefined,
     })),
   );
  const archetype = projectedPlan.floorType === "lobby" ? "SHADOW TOWER · RECEPTION"
    : projectedPlan.floorType === "recreation" ? "RECREATION · REC"
    : projectedPlan.floorType === "mezzanine" ? "PUBLIC MEZZANINE · COMPUTER CAFE"
        : projectedPlan.floorType === "rest" ? "REST WARD · CLINIC"
        : projectedPlan.floorType === "security" ? "SECURITY FLOOR · CUSTODY"
        : tenants.length ? tenants.map((tenant) => tenant.business.name).join(" + ")
        : workstations.length > 10 ? "COMPANY FLOOR" : "FOUNDER + TEAM FLOOR";
  return {
    propertyKey, label: archetype, representation: `${projectedPlan.city.replace("_", " ").toUpperCase()} · FLOOR ${projectedPlan.floorNumber}`,
    cols: projectedPlan.cols, rows: projectedPlan.rows, deskCols: workstations.length, deskRows: 1, capsules: 0,
    spawn: { x: projectedPlan.spawn.x * 16 + 8, y: projectedPlan.spawn.y * 16 + 8, facing: "right" },
    playerDesk: executive ? desk(executive, "player") : undefined,
    teamDesks: workstations.map((object) => desk(object, "team")),
    capsuleSpots: [],
    stations, rooms, tenants, plan: projectedPlan,
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

/** The arrival hall is a separate physical scene from the public computer
 * mezzanine. It has no workstation or terminal objects, so reception cannot
 * accidentally inherit a computer-cafe fit-out. */
export function getLobbyOfficeLayout(city: ShadowTowerCity): OfficePropertyLayout {
  const layout = officePropertyLayoutFromPlan(getLobbyPlan(city), `${city}:lobby`);
  return {
    ...layout,
    label: "SHADOW TOWER · MAIN LOBBY",
    representation: `${city.replace("_", " ").toUpperCase()} · ARRIVAL HALL`,
  };
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
  // Rooms are structural geometry too. Keep their door gap open, unless the
  // authoritative access state says the entrance is still locked.
  for (const room of layout.rooms) {
    const side = room.doorSide ?? "bottom";
    const span = Math.max(0, Math.min(room.doorSpan ?? 2, side === "left" || side === "right" ? room.h : room.w));
    const at = room.doorAt ?? (side === "top" || side === "bottom"
      ? room.x + Math.floor((room.w - span) / 2)
      : room.y + Math.floor((room.h - span) / 2));
    for (let col = room.x; col < room.x + room.w; col += 1) {
      if (side !== "top" || room.locked || col < at || col >= at + span) blocked.add(`${col},${room.y}`);
      if (side !== "bottom" || room.locked || col < at || col >= at + span) blocked.add(`${col},${room.y + room.h - 1}`);
    }
    for (let row = room.y; row < room.y + room.h; row += 1) {
      if (side !== "left" || room.locked || row < at || row >= at + span) blocked.add(`${room.x},${row}`);
      if (side !== "right" || room.locked || row < at || row >= at + span) blocked.add(`${room.x + room.w - 1},${row}`);
    }
  }
  return blocked;
}
export interface OfficeTile { col: number; row: number; }
export function findOfficeRoute(layout: OfficePropertyLayout, from: OfficeTile, to: OfficeTile, additionalBlocked?: ReadonlySet<string>): OfficeTile[] {
  const blocked = getOfficeBlockedTiles(layout), key = (p: OfficeTile) => `${p.col},${p.row}`;
  additionalBlocked?.forEach((tile) => blocked.add(tile));
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

/**
 * Convert authored resident waypoints into a walkable tile route. Authored paths
 * are intentionally loose (they describe a character's intention, not geometry);
 * this projection is the last-mile authority that keeps them out of walls and
 * furniture while preserving the authored order and destination.
 */
export function routeOfficePath(layout: OfficePropertyLayout, path: readonly OfficeTile[]): OfficeTile[] {
  if (path.length < 2) return path.slice();
  const clamp = (point: OfficeTile): OfficeTile => ({
    col: Math.max(0, Math.min(layout.cols - 1, Math.floor(point.col))),
    row: Math.max(0, Math.min(layout.rows - 1, Math.floor(point.row))),
  });
  const start = clamp(path[0]);
  const routed: OfficeTile[] = [{ col: start.col, row: start.row }];
  let current = start;
  for (const waypoint of path.slice(1)) {
    const target = clamp(waypoint);
    const segment = findOfficeRoute(layout, current, target);
    for (const tile of segment) {
      const previous = routed[routed.length - 1];
      if (!previous || previous.col !== tile.col || previous.row !== tile.row) routed.push(tile);
    }
    current = routed[routed.length - 1] ?? current;
  }
  return routed;
}
export const OFFICE_OBJECT_DESTINATIONS = { terminal: "/console", atm: "/game/bank", vending: "/vending?from=office", elevator: "/tower" } as const;
export type OfficeDestinationObject = keyof typeof OFFICE_OBJECT_DESTINATIONS;
export function getOfficeObjectDestination(object: OfficeDestinationObject) { return OFFICE_OBJECT_DESTINATIONS[object]; }
export function getPayphoneHubDestination() { return "/phone"; }
export function getOfficeHudMode(width: number): "compact" | "full" { return width < 640 ? "compact" : "full"; }
export function officePoseStorageKey(slot: string | number, propertyKey: string) { return `salaryman.office.pose.v2:${slot}:${propertyKey}`; }
export function loadOfficePose(slot: string | number, layout: OfficePropertyLayout): OfficePose {
  if (typeof window === "undefined") return layout.spawn;
  try { return validateOfficePose(layout, JSON.parse(localStorage.getItem(officePoseStorageKey(slot, layout.propertyKey)) || "null")) ?? layout.spawn; } catch { return layout.spawn; }
}
export function saveOfficePose(slot: string | number, layout: OfficePropertyLayout, pose: OfficePose) {
  const valid = validateOfficePose(layout, pose); if (valid && typeof window !== "undefined") localStorage.setItem(officePoseStorageKey(slot, layout.propertyKey), JSON.stringify(valid));
}