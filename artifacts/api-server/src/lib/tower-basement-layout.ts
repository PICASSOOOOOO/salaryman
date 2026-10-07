export const TOWER_BASEMENT_MAZE_CELL_SIZE = 1_000;
export const TOWER_BASEMENT_MAZES: Record<number, readonly (readonly [number, number])[]> = {
  4: [
    [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 4], [3, 5], [3, 6], [4, 4], [4, 5], [4, 6], [5, 3], [5, 4], [5, 5], [5, 6],
    [5, 7], [6, 3], [6, 5], [7, 3], [7, 4], [7, 5],
  ],
  5: [
    [2, 3], [2, 4], [2, 5], [2, 6], [3, 3], [3, 5], [3, 6], [4, 3], [4, 4], [4, 5],
    [4, 6], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [6, 2], [6, 3], [6, 5], [6, 6],
    [7, 2], [7, 3], [7, 6], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7],
  ],
  6: [
    [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [3, 3], [3, 5], [3, 7], [4, 3], [4, 4],
    [4, 5], [4, 7], [5, 3], [5, 4], [5, 5], [5, 7], [6, 3], [6, 5], [6, 6], [6, 7],
    [7, 2], [7, 3], [7, 4], [7, 5], [8, 3], [8, 4], [8, 5],
  ],
};

export function isTowerBasementMazePointWalkable(level: number, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 10_000 || y < 0 || y > 10_000) {
    return false;
  }
  if (!Number.isInteger(level) || level < 1 || level > 6) return false;
  const cells = TOWER_BASEMENT_MAZES[level];
  if (!cells) return true;
  const col = Math.min(9, Math.floor(x / TOWER_BASEMENT_MAZE_CELL_SIZE));
  const row = Math.min(9, Math.floor(y / TOWER_BASEMENT_MAZE_CELL_SIZE));
  return cells.some(([cellX, cellY]) => cellX === col && cellY === row);
}

export function isTowerBasementMazeSegmentWalkable(
  level: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / (TOWER_BASEMENT_MAZE_CELL_SIZE / 4)));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const x = Math.round(from.x + (to.x - from.x) * ratio);
    const y = Math.round(from.y + (to.y - from.y) * ratio);
    if (!isTowerBasementMazePointWalkable(level, x, y)) return false;
  }
  return true;
}

export const TOWER_GHOST_HIDEOUTS = [
  { level: 4, x: 7_500, y: 3_500, location: "SUPPLY TUNNEL" },
  { level: 5, x: 8_500, y: 3_500, location: "GENERATOR PASSAGE" },
  { level: 6, x: 6_500, y: 6_500, location: "PUMP ACCESS" },
  { level: 2, x: 5_000, y: 5_000, location: "STAIRWELL" },
  { level: 1, x: 9_500, y: 9_000, location: "REAR SHIPPING" },
] as const;

export function getTowerGhostHideout(now: Date = new Date()) {
  const interval = 10 * 60 * 1_000;
  const index = Math.floor(now.getTime() / interval) % TOWER_GHOST_HIDEOUTS.length;
  return TOWER_GHOST_HIDEOUTS[index]!;
}

export const TOWER_BASEMENT_STATIONS = {
  power: { level: 5, x: 7_500, y: 2_000 },
  plumbing: { level: 6, x: 2_500, y: 7_500 },
  upkeep: { level: 3, x: 7_500, y: 7_500 },
  shippingWaste: { level: 1, x: 9_000, y: 9_000 },
  loadingGate: { level: 1, x: 9_000, y: 7_000 },
} as const;

export const TOWER_TRASH_BINS = {
  1: { room: "lobby", x: 49_975_600, y: 50_002_300 },
  6: { room: "recreation", x: 9_550, y: 9_000 },
} as const;

export const TOWER_RESTROOM_STALLS = {
  "lobby-restroom-stall-1": { floorNumber: 1, room: "lobby", x: 49_978_300, y: 50_002_200 },
  "lobby-restroom-stall-2": { floorNumber: 1, room: "lobby", x: 49_978_300, y: 50_001_600 },
  "recreation-restroom-stall-1": { floorNumber: 6, room: "recreation", x: 10_000, y: 18_000 },
  "recreation-restroom-stall-2": { floorNumber: 6, room: "recreation", x: 10_000, y: 18_600 },
} as const;

export const TOWER_POWER_EXPORT_REACH = 800;
export const TOWER_SERVICE_ELEVATOR_LOBBY = { x: 49_977_600, y: 49_999_100 } as const;
export const TOWER_SERVICE_ELEVATOR_BASEMENT = { x: 5_000, y: 4_000 } as const;
