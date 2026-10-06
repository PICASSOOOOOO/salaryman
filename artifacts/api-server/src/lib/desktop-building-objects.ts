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
  { id: "lobby-tv", room: "lobby", label: "Lobby television", x: 49_978_800, y: 49_998_000 },
  { id: "lobby-elevator", room: "lobby", label: "Lobby elevator", x: 49_977_000, y: 50_000_000 },
  { id: "lobby-stairs", room: "lobby", label: "Lobby staircase", x: 49_978_650, y: 50_000_800 },
  { id: "recreation-elevator", room: "recreation", label: "Hallway elevator", x: 1_100, y: 4_100 },
  { id: "recreation-stairs", room: "recreation", label: "Hallway staircase", x: 8_500, y: 4_100 },
  { id: "hall-office-1-door", room: "recreation", label: "Office 01 door", x: 1_800, y: 5_100 },
  { id: "hall-office-2-door", room: "recreation", label: "Office 02 door", x: 3_900, y: 5_100 },
  { id: "hall-office-3-door", room: "recreation", label: "Office 03 door", x: 6_000, y: 5_100 },
  { id: "hall-office-4-door", room: "recreation", label: "Office 04 door", x: 8_100, y: 5_100 },
  { id: "arcade-cyber-serpent", room: "recreation", label: "Cyber Serpent cabinet", x: 2_500, y: 4_300 },
  { id: "arcade-void-invaders", room: "recreation", label: "Void Invaders cabinet", x: 2_900, y: 4_300 },
  { id: "arcade-barrel-runner", room: "recreation", label: "Barrel Runner cabinet", x: 3_300, y: 4_300 },
  { id: "arcade-neon-breaker", room: "recreation", label: "Neon Breaker cabinet", x: 3_700, y: 4_300 },
  { id: "executive-desk", room: "executive", label: "Office desk", x: 1_300, y: 6_100 },
  { id: "executive-chair", room: "executive", label: "Office chair", x: 1_300, y: 6_380 },
  { id: "executive-crt", room: "executive", label: "Work terminal", x: 1_750, y: 6_350 },
  { id: "executive-telephone", room: "executive", label: "Office telephone", x: 1_400, y: 6_250 },
  { id: "executive-atm", room: "executive", label: "Office ATM", x: 2_700, y: 6_150 },
  { id: "executive-vending", room: "executive", label: "Office vending machine", x: 2_700, y: 6_950 },
  { id: "executive-window-west", room: "executive", label: "West window", x: 1_400, y: 5_750 },
  { id: "executive-window-east", room: "executive", label: "East window", x: 2_800, y: 5_750 },
  { id: "executive-desk-2", room: "executive", label: "Office desk", x: 2_300, y: 6_100 },
  { id: "executive-chair-2", room: "executive", label: "Office chair", x: 2_300, y: 6_380 },
  { id: "executive-crt-2", room: "executive", label: "Work terminal", x: 2_300, y: 6_380 },
  { id: "executive-desk-3", room: "executive", label: "Office desk", x: 1_300, y: 6_800 },
  { id: "executive-chair-3", room: "executive", label: "Office chair", x: 1_300, y: 7_080 },
  { id: "executive-crt-3", room: "executive", label: "Work terminal", x: 1_300, y: 7_080 },
  { id: "executive-desk-4", room: "executive", label: "Office desk", x: 2_300, y: 6_800 },
  { id: "executive-chair-4", room: "executive", label: "Office chair", x: 2_300, y: 7_080 },
  { id: "executive-crt-4", room: "executive", label: "Work terminal", x: 2_300, y: 7_080 },
  { id: "office4-elevator", room: "public", label: "Office elevator", x: 3_200, y: 6_400 },
  { id: "office4-stairs", room: "public", label: "Office staircase", x: 4_600, y: 6_400 },
  { id: "office4-desk", room: "public", label: "Office desk", x: 3_900, y: 6_250 },
  { id: "office4-chair", room: "public", label: "Office chair", x: 3_900, y: 6_950 },
  { id: "office4-telephone", room: "public", label: "Office telephone", x: 3_500, y: 6_250 },
  { id: "office4-vending", room: "public", label: "Office vending machine", x: 4_500, y: 6_950 },
  { id: "office3-desk", room: "office_03", label: "Office desk", x: 6_000, y: 6_250 },
  { id: "office3-chair", room: "office_03", label: "Office chair", x: 6_000, y: 6_950 },
  { id: "office3-telephone", room: "office_03", label: "Office telephone", x: 5_600, y: 6_250 },
  { id: "office4b-desk", room: "office_04", label: "Office desk", x: 8_100, y: 6_250 },
  { id: "office4b-chair", room: "office_04", label: "Office chair", x: 8_100, y: 6_950 },
  { id: "office4b-telephone", room: "office_04", label: "Office telephone", x: 7_700, y: 6_250 },
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
  recreation: { minX: 700, maxX: 9_000, minY: 3_400, maxY: 5_200 },
  executive: { minX: 900, maxX: 2_700, minY: 5_200, maxY: 7_400 },
  public: { minX: 3_000, maxX: 4_800, minY: 5_200, maxY: 7_400 },
  office_03: { minX: 5_100, maxX: 6_900, minY: 5_200, maxY: 7_400 },
  office_04: { minX: 7_200, maxX: 9_000, minY: 5_200, maxY: 7_400 },
};

const ROOM_SPAWNS: Record<string, Position> = {
  lobby: { x: 49_978_000, y: 50_000_000 },
  recreation: { x: 4_800, y: 4_550 },
  executive: { x: 1_800, y: 6_550 },
  public: { x: 3_900, y: 6_650 },
  office_03: { x: 6_000, y: 6_650 },
  office_04: { x: 8_100, y: 6_650 },
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

  const obstacles = room === "lobby"
    ? [
      { x: 49_978_250, y: 49_999_600, hx: 380, hy: 230 },
      { x: 49_976_750, y: 50_000_800, hx: 230, hy: 260 },
      { x: 49_978_750, y: 50_000_800, hx: 230, hy: 260 },
      { x: 49_976_200, y: 49_999_300, hx: 100, hy: 100 },
      { x: 49_978_800, y: 49_998_000, hx: 120, hy: 80 },
    ]
    : room === "recreation"
      ? [
        { x: 2_500, y: 4_300, hx: 240, hy: 260 },
        { x: 1_800, y: 5_100, hx: 180, hy: 110 },
        { x: 3_900, y: 5_100, hx: 180, hy: 110 },
        { x: 6_000, y: 5_100, hx: 180, hy: 110 },
        { x: 8_100, y: 5_100, hx: 180, hy: 110 },
      ]
      : [
        {
          x: room === "executive" ? 1_300 : room === "public" ? 3_500 : room === "office_03" ? 5_500 : 7_600,
          y: 6_100,
          hx: 380,
          hy: 230,
        },
        ...(room === "executive"
          ? [
            { x: 2_400, y: 5_800, hx: 230, hy: 260 },
            { x: 2_400, y: 6_200, hx: 230, hy: 260 },
          ]
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
