export type BuildingObjectAction = "clean" | "repair";

export type BuildingObjectDefinition = {
  id: string;
  room: string;
  label: string;
  x: number;
  y: number;
};

export const BUILDING_MAINTAINABLE_OBJECTS: readonly BuildingObjectDefinition[] = [
  { id: "lobby-reception-desk", room: "lobby", label: "Reception desk", x: 49_978_250, y: 49_999_600 },
  { id: "lobby-atm", room: "lobby", label: "Lobby ATM", x: 49_976_750, y: 50_000_800 },
  { id: "lobby-vending", room: "lobby", label: "Lobby vending machine", x: 49_978_750, y: 50_000_800 },
  { id: "lobby-pay-phone", room: "lobby", label: "Lobby pay phone", x: 49_976_200, y: 49_999_300 },
  { id: "lobby-elevator", room: "lobby", label: "Lobby elevator", x: 49_977_000, y: 50_000_000 },
  { id: "lobby-stairs", room: "lobby", label: "Lobby staircase", x: 49_978_650, y: 50_000_800 },
  { id: "recreation-elevator", room: "recreation", label: "Office floor elevator", x: 11_000, y: 1_500 },
  { id: "recreation-stairs", room: "recreation", label: "Office floor staircase", x: 11_000, y: 23_500 },
  { id: "recreation-atm", room: "recreation", label: "Shared floor ATM", x: 12_800, y: 5_000 },
  { id: "recreation-vending", room: "recreation", label: "Shared floor vending machine", x: 12_800, y: 8_000 },
  { id: "hall-office-1-door", room: "recreation", label: "Office 01 door", x: 4_500, y: 11_000 },
  { id: "hall-office-2-door", room: "recreation", label: "Office 02 door", x: 17_500, y: 11_000 },
  { id: "hall-office-3-door", room: "recreation", label: "Office 03 door", x: 4_500, y: 14_000 },
  { id: "hall-office-4-door", room: "recreation", label: "Office 04 door", x: 17_500, y: 14_000 },
  { id: "executive-suite-door", room: "executive", label: "Lockable executive suite door", x: 2_500, y: 4_600 },
];

export const BUILDING_OBJECT_DEFAULTS = { cleanliness: 80, condition: 85 } as const;
export const BUILDING_PRESENCE_MAX_AGE_MS = 10_000;
const MAX_WALK_SPEED = 600;
const WALKING_TOLERANCE = 350;

type Position = { x: number; y: number };
export type BuildingPresenceRoom = "lobby" | "hallway" | "office";
type PresenceForValidation = Position & {
  room: string;
  roomKey: string;
  floorNumber: number;
  linkId: string;
  lastSeenAt: Date;
};

const ROOM_BOUNDS: Record<string, { minX: number; maxX: number; minY: number; maxY: number }> = {
  lobby: { minX: 49_975_000, maxX: 49_979_000, minY: 49_997_000, maxY: 50_003_000 },
  recreation: { minX: 0, maxX: 22_000, minY: 0, maxY: 25_000 },
  executive: { minX: 0, maxX: 9_000, minY: 0, maxY: 11_000 },
  public: { minX: 13_000, maxX: 22_000, minY: 0, maxY: 11_000 },
  office_03: { minX: 0, maxX: 9_000, minY: 14_000, maxY: 25_000 },
  office_04: { minX: 13_000, maxX: 22_000, minY: 14_000, maxY: 25_000 },
};

const ROOM_SPAWNS: Record<string, Position> = {
  lobby: { x: 49_978_000, y: 50_000_000 },
  recreation: { x: 11_000, y: 12_500 },
  executive: { x: 4_500, y: 5_500 },
  public: { x: 17_500, y: 5_500 },
  office_03: { x: 4_500, y: 19_500 },
  office_04: { x: 17_500, y: 19_500 },
};

export function catalogRoomForPresence(room: BuildingPresenceRoom, ownOfficeRoom: string | null): string | null {
  if (room === "lobby") return "lobby";
  if (room === "hallway") return "recreation";
  return ownOfficeRoom && ROOM_BOUNDS[ownOfficeRoom] ? ownOfficeRoom : null;
}

export function buildingObjectsForRoom(room: string): readonly BuildingObjectDefinition[] {
  return BUILDING_MAINTAINABLE_OBJECTS.filter((object) => object.room === room);
}

export function buildingObject(room: string, objectId: string): BuildingObjectDefinition | null {
  return BUILDING_MAINTAINABLE_OBJECTS.find((object) => object.room === room && object.id === objectId) ?? null;
}

function pointIsWalkable(room: string, point: Position): boolean {
  const bounds = ROOM_BOUNDS[room];
  if (!bounds
    || point.x < bounds.minX || point.x > bounds.maxX
    || point.y < bounds.minY || point.y > bounds.maxY) return false;

  if (room === "recreation") {
    const hallwayRegions = [
      { x: 9_000, y: 0, width: 4_000, height: 25_000 },
      { x: 0, y: 11_000, width: 9_000, height: 3_000 },
      { x: 13_000, y: 11_000, width: 9_000, height: 3_000 },
    ];
    if (!hallwayRegions.some((region) =>
      point.x >= region.x && point.x <= region.x + region.width
      && point.y >= region.y && point.y <= region.y + region.height)) return false;
  }

  const obstacles = room === "lobby"
    ? [
      { x: 49_978_250, y: 49_999_600, hx: 380, hy: 230 },
      { x: 49_976_750, y: 50_000_800, hx: 230, hy: 260 },
      { x: 49_978_750, y: 50_000_800, hx: 230, hy: 260 },
      { x: 49_976_200, y: 49_999_300, hx: 100, hy: 100 },
    ]
    : room === "recreation"
      ? [
        { x: 12_800, y: 5_000, hx: 230, hy: 260 },
        { x: 12_800, y: 8_000, hx: 230, hy: 260 },
      ]
      : [
        ...(room === "executive"
          ? [{ x: 1_200, y: 5_500, hx: 1_250, hy: 1_450 }]
          : []),
      ];
  return !obstacles.some((obstacle) =>
    Math.abs(point.x - obstacle.x) < obstacle.hx
    && Math.abs(point.y - obstacle.y) < obstacle.hy);
}

export function isWalkableBuildingPosition(room: string, point: Position): boolean {
  return pointIsWalkable(room, point);
}

export function validateBuildingPresence(
  previous: PresenceForValidation | null,
  next: { room: BuildingPresenceRoom; roomKey: string; floorNumber: number; linkId: string; x: number; y: number },
  now: Date,
  ownOfficeRoom: string | null,
): string | null {
  if (!Number.isInteger(next.floorNumber) || next.floorNumber < 1 || next.floorNumber > 67) {
    return "Floor is outside the supported building";
  }
  const catalogRoom = catalogRoomForPresence(next.room, ownOfficeRoom);
  if (!catalogRoom || !pointIsWalkable(catalogRoom, next)) {
    return "Position is outside the walkable building room";
  }
  const spawn = ROOM_SPAWNS[catalogRoom];
  if (!previous || previous.linkId !== next.linkId
    || previous.room !== next.room || previous.roomKey !== next.roomKey
    || previous.floorNumber !== next.floorNumber) {
    return Math.hypot(next.x - spawn.x, next.y - spawn.y) <= 350
      ? null
      : "Enter the room through its marked entrance";
  }
  const elapsedMs = now.getTime() - previous.lastSeenAt.getTime();
  if (elapsedMs <= 0 || elapsedMs > 30_000) {
    return Math.hypot(next.x - spawn.x, next.y - spawn.y) <= 350
      ? null
      : "Presence is stale; re-enter the room";
  }
  const maxDistance = MAX_WALK_SPEED * elapsedMs / 1_000 + WALKING_TOLERANCE;
  if (Math.hypot(next.x - previous.x, next.y - previous.y) > maxDistance) {
    return "Movement exceeded the server-validated walking limit";
  }
  const sampleCount = Math.max(1, Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y) / 100));
  for (let index = 1; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount;
    const point = {
      x: previous.x + (next.x - previous.x) * ratio,
      y: previous.y + (next.y - previous.y) * ratio,
    };
    if (!pointIsWalkable(catalogRoom, point)) return "Movement crossed a blocked area";
  }
  return null;
}
