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
