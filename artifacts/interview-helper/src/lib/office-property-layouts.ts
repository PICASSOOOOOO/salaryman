import type { OfficeRoom, OfficeStation } from "@/components/office/office-types";

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
  stations: Omit<OfficeStation, "onInteract">[];
  rooms: OfficeRoom[];
}

const stations = (cols: number, rows: number): Omit<OfficeStation, "onInteract">[] => [
  { id: "elevator", label: "ELEVATOR", col: cols - 5, row: 2, glyph: "elevator", radius: 30 },
  { id: "atm", label: "ATM", col: cols - 10, row: 2, glyph: "atm", radius: 28 },
  { id: "payphone", label: "PAYPHONE", col: 1, row: Math.max(7, Math.floor(rows * 0.42)), glyph: "payphone", radius: 28 },
  { id: "vending", label: "VENDING", col: 1, row: Math.max(12, Math.floor(rows * 0.7)), glyph: "vending", radius: 28 },
];

const room = (id: string, label: string, x: number, y: number, w: number, h: number, accent: string): OfficeRoom => ({
  id, label, x, y, w, h, accent, doorSide: "bottom", doorSpan: 2,
});

const define = (
  propertyKey: string, label: string, representation: string,
  cols: number, rows: number, deskCols: number, deskRows: number, capsules: number,
  rooms: OfficeRoom[],
): OfficePropertyLayout => ({
  propertyKey, label, representation, cols, rows, deskCols, deskRows, capsules,
  spawn: { x: Math.min(10, cols - 3) * 16, y: (rows - 3) * 16, facing: "right" },
  stations: stations(cols, rows),
  rooms,
});

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
  for (const station of layout.stations) {
    const w = station.art?.wTiles ?? 1.4;
    const h = station.art?.hTiles ?? 1.6;
    const tx = station.col + w / 2;
    const ty = station.row + h;
    const blocked = station.glyph === "elevator"
      ? col >= Math.floor(tx - 1) && col <= Math.floor(tx + 1) && row === Math.floor(ty)
      : col >= Math.floor(tx - 0.6) && col <= Math.floor(tx + 0.6)
        && row >= Math.floor(ty - 0.6) && row <= Math.floor(ty + 0.4);
    if (blocked) return null;
  }
  return { x, y, facing: p.facing === "left" ? "left" : "right" };
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
