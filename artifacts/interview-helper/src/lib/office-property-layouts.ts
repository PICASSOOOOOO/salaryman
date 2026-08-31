import type {
  OfficeCapsule,
  OfficeDesk,
  OfficeFloorRect,
  OfficeRoom,
  OfficeStation,
} from "@/components/office/office-types";

export type OfficeFacing = "left" | "right";
export type OfficePose = { x: number; y: number; facing: OfficeFacing };

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
}

const stations = (cols: number, rows: number): Omit<OfficeStation, "onInteract">[] => [
  { id: "elevator", label: "ELEVATOR", col: cols - 4, row: 1, glyph: "elevator", radius: 34, footprint: { w: 2, d: 1 } },
  { id: "atm", label: "ATM", col: cols - 8, row: 1, glyph: "atm", radius: 30, footprint: { w: 1.6, d: 1 } },
  { id: "payphone", label: "PAYPHONE", col: 1, row: Math.max(6, Math.floor(rows * 0.38)), glyph: "payphone", radius: 30, footprint: { w: 1.2, d: 1 } },
  { id: "vending", label: "VENDING", col: 1, row: Math.max(10, Math.floor(rows * 0.68)), glyph: "vending", radius: 30, footprint: { w: 1.6, d: 1 } },
];

const room = (id: string, label: string, x: number, y: number, w: number, h: number, accent: string): OfficeRoom => ({
  id, label, x, y, w, h, accent, doorSide: "bottom", doorSpan: 2,
});

const define = (
  propertyKey: string, label: string, representation: string,
  cols: number, rows: number, deskCols: number, deskRows: number, capsules: number,
  rooms: OfficeRoom[],
): OfficePropertyLayout => {
  const workZoneCols = Math.max(8, Math.floor(cols * 0.66));
  const xStep = deskCols > 1 ? Math.max(2.8, (workZoneCols - 5) / (deskCols - 1)) : 0;
  const yStep = deskRows > 1 ? Math.max(2.8, Math.min(3.5, (rows - 11) / (deskRows - 1))) : 0;
  const teamDesks: OfficeDesk[] = [];
  for (let r = 0; r < deskRows; r++) {
    for (let c = 0; c < deskCols; c++) {
      teamDesks.push({
        id: `team-desk-${r}-${c}`,
        kind: "team",
        col: 3 + c * xStep,
        row: 4 + r * yStep,
        w: 2.4,
        d: 1.45,
      });
    }
  }
  const capsuleSpots: OfficeCapsule[] = Array.from({ length: capsules }, (_, i) => ({
    id: `capsule-${i}`,
    kind: "capsule",
    col: 1 + i * 2.35,
    row: 1,
    w: 1.25,
    d: 1,
  }));
  const playerDesk: OfficeDesk = {
    id: "player-desk",
    kind: "player",
    col: Math.max(3, Math.min(workZoneCols - 3, 5)),
    row: rows - 4.6,
    w: 2.8,
    d: 1.55,
  };
  return {
    propertyKey, label, representation, cols, rows, deskCols, deskRows, capsules,
    spawn: { x: Math.min(playerDesk.col + 4, cols - 2) * 16, y: (rows - 2) * 16, facing: "left" },
    playerDesk,
    teamDesks,
    capsuleSpots,
    stations: stations(cols, rows),
    rooms,
  };
};

export const OFFICE_PROPERTY_LAYOUTS: Record<string, OfficePropertyLayout> = {
  property_apartment_office: define(
    "property_apartment_office", "APARTMENT OFFICE", "720 SQ FT · LIVE/WORK FLOOR",
    18, 16, 3, 1, 2,
    [room("kitchenette", "KITCHENETTE", 11, 8, 5, 5, "#67e8f9")],
  ),
  property_coworking_suite: define(
    "property_coworking_suite", "CO-WORKING SUITE", "1,300 SQ FT · SHARED SUITE",
    24, 20, 4, 2, 4,
    [room("reception", "RECEPTION", 16, 7, 6, 5, "#a7f3d0"), room("phone-booths", "PHONE BOOTHS", 16, 13, 6, 5, "#7dd3fc")],
  ),
  property_corner_office: define(
    "property_corner_office", "CORNER OFFICE", "2,200 SQ FT · EXECUTIVE FLOOR",
    30, 24, 5, 3, 5,
    [room("private-office", "PRIVATE OFFICE", 21, 8, 7, 6, "#c4b5fd"), room("espresso", "ESPRESSO BAR", 21, 16, 7, 5, "#fcd34d")],
  ),
  property_warehouse: define(
    "property_warehouse", "OPERATIONS WAREHOUSE", "6,800 SQ FT · REPRESENTATIVE OPS BAY",
    38, 28, 7, 3, 8,
    [room("loading", "LOADING CONTROL", 28, 8, 8, 7, "#fb923c"), room("power", "HEAVY POWER", 28, 18, 8, 7, "#facc15")],
  ),
  property_hq_floor: define(
    "property_hq_floor", "HEADQUARTERS FLOOR", "18,500 SQ FT · FLAGSHIP HQ FLOOR",
    46, 34, 8, 4, 10,
    [room("reception", "EXEC RECEPTION", 34, 7, 10, 7, "#67e8f9"), room("war-room", "WAR ROOM", 34, 17, 10, 7, "#f87171"), room("servers", "SERVER CLOSET", 34, 27, 10, 5, "#a78bfa")],
  ),
  property_tower: define(
    "property_tower", "PRIVATE TOWER", "120,000 SQ FT · FLAGSHIP SKY LOBBY",
    54, 40, 10, 5, 12,
    [room("lobby", "PRIVATE LOBBY", 40, 6, 12, 8, "#38bdf8"), room("boardroom", "BOARDROOM", 40, 17, 12, 8, "#c4b5fd"), room("cafeteria", "CAFETERIA", 40, 28, 12, 9, "#86efac")],
  ),
  property_campus: define(
    "property_campus", "CORPORATE CAMPUS", "540,000 SQ FT · CONNECTED CAMPUS COMMONS",
    64, 46, 12, 6, 14,
    [room("tower-a", "TOWER A LINK", 48, 5, 14, 9, "#38bdf8"), room("tower-b", "TOWER B LINK", 48, 17, 14, 9, "#a78bfa"), room("tower-c", "TOWER C LINK", 48, 29, 14, 9, "#f472b6"), room("transit", "SHUTTLE ATRIUM", 23, 36, 20, 8, "#86efac")],
  ),
};

export const DEFAULT_OFFICE_PROPERTY_KEY = "property_apartment_office";

export function getOfficePropertyLayout(propertyKey?: string | null): OfficePropertyLayout {
  return OFFICE_PROPERTY_LAYOUTS[propertyKey ?? ""] ?? OFFICE_PROPERTY_LAYOUTS[DEFAULT_OFFICE_PROPERTY_KEY];
}

export function validateOfficePose(layout: OfficePropertyLayout, pose: unknown): OfficePose | null {
  if (!pose || typeof pose !== "object") return null;
  const p = pose as Partial<OfficePose>;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const x = Number(p.x), y = Number(p.y);
  if (x < 8 || x > layout.cols * 16 - 8 || y < 2.3 * 16 || y > layout.rows * 16 - 6) return null;
  const col = Math.floor(x / 16), row = Math.floor(y / 16);
  for (const room of layout.rooms) {
    const onHorizontalWall = (row === room.y || row === room.y + room.h - 1) && col >= room.x && col < room.x + room.w;
    const onVerticalWall = (col === room.x || col === room.x + room.w - 1) && row >= room.y && row < room.y + room.h;
    if (onHorizontalWall || onVerticalWall) return null;
  }
  if (getOfficeBlockedTiles(layout).has(`${col},${row}`)) return null;
  return { x, y, facing: p.facing === "left" ? "left" : "right" };
}

function addRectTiles(set: Set<string>, rect: OfficeFloorRect): void {
  const c0 = Math.floor(rect.col);
  const c1 = Math.ceil(rect.col + rect.w) - 1;
  const r0 = Math.floor(rect.row);
  const r1 = Math.ceil(rect.row + rect.d) - 1;
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) set.add(`${c},${r}`);
  }
}

export function getOfficeBlockedTiles(layout: OfficePropertyLayout): Set<string> {
  const blocked = new Set<string>();
  for (const room of layout.rooms) {
    const side = room.doorSide ?? "bottom";
    const span = room.doorSpan ?? 2;
    const horizontal = side === "top" || side === "bottom";
    const at = room.doorAt ?? (horizontal
      ? room.x + Math.floor((room.w - span) / 2)
      : room.y + Math.floor((room.h - span) / 2));
    for (let c = room.x; c < room.x + room.w; c++) {
      if (!(side === "top" && c >= at && c < at + span)) blocked.add(`${c},${room.y}`);
      if (!(side === "bottom" && c >= at && c < at + span)) blocked.add(`${c},${room.y + room.h - 1}`);
    }
    for (let r = room.y; r < room.y + room.h; r++) {
      if (!(side === "left" && r >= at && r < at + span)) blocked.add(`${room.x},${r}`);
      if (!(side === "right" && r >= at && r < at + span)) blocked.add(`${room.x + room.w - 1},${r}`);
    }
  }
  addRectTiles(blocked, layout.playerDesk);
  layout.teamDesks.forEach((desk) => addRectTiles(blocked, desk));
  layout.capsuleSpots.forEach((capsule) => addRectTiles(blocked, capsule));
  layout.stations.forEach((station) => addRectTiles(blocked, {
    id: station.id,
    col: station.col,
    row: station.row,
    w: station.footprint?.w ?? 1.4,
    d: station.footprint?.d ?? 1,
  }));
  return blocked;
}

export interface OfficeTile {
  col: number;
  row: number;
}

export function findOfficeRoute(
  layout: OfficePropertyLayout,
  from: OfficeTile,
  to: OfficeTile,
): OfficeTile[] {
  const blocked = getOfficeBlockedTiles(layout);
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(n)));
  const start = { col: clamp(from.col, layout.cols), row: clamp(from.row, layout.rows) };
  const goal = { col: clamp(to.col, layout.cols), row: clamp(to.row, layout.rows) };
  const key = (p: OfficeTile) => `${p.col},${p.row}`;
  blocked.delete(key(start));
  if (blocked.has(key(goal))) {
    const candidates = [
      { col: goal.col + 1, row: goal.row },
      { col: goal.col - 1, row: goal.row },
      { col: goal.col, row: goal.row + 1 },
      { col: goal.col, row: goal.row - 1 },
    ].filter((p) => p.col >= 0 && p.row >= 2 && p.col < layout.cols && p.row < layout.rows && !blocked.has(key(p)));
    if (!candidates.length) return [];
    candidates.sort((a, b) =>
      Math.hypot(a.col - start.col, a.row - start.row) - Math.hypot(b.col - start.col, b.row - start.row));
    goal.col = candidates[0].col;
    goal.row = candidates[0].row;
  }
  const queue: OfficeTile[] = [start];
  const previous = new Map<string, OfficeTile | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (key(current) === key(goal)) break;
    const neighbors = [
      { col: current.col + 1, row: current.row },
      { col: current.col - 1, row: current.row },
      { col: current.col, row: current.row + 1 },
      { col: current.col, row: current.row - 1 },
    ];
    for (const next of neighbors) {
      const nextKey = key(next);
      if (next.col < 0 || next.row < 2 || next.col >= layout.cols || next.row >= layout.rows) continue;
      if (blocked.has(nextKey) || previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      queue.push(next);
    }
  }
  if (!previous.has(key(goal))) return [];
  const route: OfficeTile[] = [];
  let cursor: OfficeTile | null = goal;
  while (cursor && key(cursor) !== key(start)) {
    route.push(cursor);
    cursor = previous.get(key(cursor)) ?? null;
  }
  return route.reverse();
}

export const PAYPHONE_HUB_DESTINATION = "/phone?tab=chat";

export const OFFICE_OBJECT_DESTINATIONS = {
  terminal: "/console",
  atm: "/game/bank",
  payphone: PAYPHONE_HUB_DESTINATION,
  vending: "/vending?from=office",
} as const;

export type OfficeDestinationObject = keyof typeof OFFICE_OBJECT_DESTINATIONS;

export function getOfficeObjectDestination(object: OfficeDestinationObject): string {
  return OFFICE_OBJECT_DESTINATIONS[object];
}

/** The canonical phone product hub used by every physical payphone. */
export function getPayphoneHubDestination(): string {
  return PAYPHONE_HUB_DESTINATION;
}

export function getOfficeHudMode(width: number): "compact" | "full" {
  return width < 640 ? "compact" : "full";
}

export function officePoseStorageKey(slot: string | number, propertyKey: string): string {
  return `salaryman.office.pose.v1:${encodeURIComponent(slot)}:${encodeURIComponent(propertyKey)}`;
}

export function loadOfficePose(slot: string | number, layout: OfficePropertyLayout): OfficePose {
  if (typeof window === "undefined") return layout.spawn;
  try {
    const raw = window.sessionStorage.getItem(officePoseStorageKey(slot, layout.propertyKey));
    return validateOfficePose(layout, raw ? JSON.parse(raw) : null) ?? layout.spawn;
  } catch {
    return layout.spawn;
  }
}

export function saveOfficePose(slot: string | number, layout: OfficePropertyLayout, pose: OfficePose): void {
  if (typeof window === "undefined") return;
  const valid = validateOfficePose(layout, pose);
  if (!valid) return;
  window.sessionStorage.setItem(officePoseStorageKey(slot, layout.propertyKey), JSON.stringify(valid));
}
