import { TOWER_SERVICE_ELEVATOR_LOBBY } from "./tower-basement-layout";

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
export const PLAYABLE_TOWER_FLOORS: ReadonlySet<number> = new Set(
  Array.from({ length: 12 }, (_, index) => index + 1),
);
export const TOWER_ELEVATOR_POSITIONS: Readonly<Record<number, { x: number; y: number }>> = {
  1: { x: 49_977_000, y: 50_000_000 },
  2: { x: 11_000, y: 1_500 },
  3: { x: 11_000, y: 1_500 },
  4: { x: 11_000, y: 1_500 },
  5: { x: 11_000, y: 1_500 },
  6: { x: 11_000, y: 1_500 },
  7: { x: 11_000, y: 1_500 },
  8: { x: 11_000, y: 1_500 },
  9: { x: 11_000, y: 1_500 },
  10: { x: 11_000, y: 1_500 },
  11: { x: 11_000, y: 1_500 },
  12: { x: 11_000, y: 1_500 },
};
export const TOWER_PASSENGER_ELEVATOR_POSITIONS: Readonly<Record<number, readonly Position[]>> = {
  1: [
    { x: 49_975_500, y: 50_000_000 },
    { x: 49_976_300, y: 50_000_000 },
    { x: 49_977_100, y: 50_000_000 },
    { x: 49_977_900, y: 50_000_000 },
  ],
  2: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  3: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  4: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  5: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  6: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  7: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  8: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  9: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  10: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  11: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
  12: [{ x: 9_300, y: 1_500 }, { x: 10_000, y: 1_500 }, { x: 11_000, y: 1_500 }, { x: 12_000, y: 1_500 }],
};
export const TOWER_SERVICE_ELEVATOR_POSITIONS: Readonly<Record<number, Position>> = {
  1: TOWER_SERVICE_ELEVATOR_LOBBY,
  2: { x: 12_500, y: 1_500 },
  3: { x: 12_500, y: 1_500 },
  4: { x: 12_500, y: 1_500 },
  5: { x: 12_500, y: 1_500 },
  6: { x: 12_500, y: 1_500 },
  7: { x: 12_500, y: 1_500 },
  8: { x: 12_500, y: 1_500 },
  9: { x: 12_500, y: 1_500 },
  10: { x: 12_500, y: 1_500 },
  11: { x: 12_500, y: 1_500 },
  12: { x: 12_500, y: 1_500 },
};
export const TOWER_STAIRWELL_POSITIONS: Readonly<Record<number, readonly Position[]>> = {
  1: [
    { x: 49_978_650, y: 50_000_800 },
    { x: 49_975_350, y: 50_000_900 },
  ],
  2: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  3: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  4: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  5: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  6: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  7: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  8: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  9: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  10: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  11: [{ x: 9_500, y: 12_500 }, { x: 12_500, y: 12_500 }],
  12: [{ x: 9_500, y: 12_500 }],
};
export const TOWER_ELEVATOR_INTERACTION_RADIUS = 1_250;
export const TOWER_STAIRWELL_INTERACTION_RADIUS = 1_250;
const MAX_WALK_SPEED = 600;
const WALKING_TOLERANCE = 350;

type Position = { x: number; y: number };
export type BuildingPresenceRoom = "lobby" | "hallway" | "office" | "executive_suite";
type PresenceForValidation = Position & {
  room: string;
  roomKey: string;
  floorNumber: number;
  destinationFloor?: number | null;
  action?: string;
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
  executive_suite: { minX: 0, maxX: 2_500, minY: 4_000, maxY: 7_000 },
};

const ROOM_SPAWNS: Record<string, Position> = {
  lobby: { x: 49_978_000, y: 50_000_000 },
  recreation: { x: 11_000, y: 1_500 },
  executive: { x: 4_500, y: 5_500 },
  public: { x: 17_500, y: 5_500 },
  office_03: { x: 4_500, y: 19_500 },
  office_04: { x: 17_500, y: 19_500 },
  executive_suite: { x: 1_800, y: 5_500 },
};

export function catalogRoomForPresence(room: BuildingPresenceRoom, ownOfficeRoom: string | null): string | null {
  if (room === "lobby") return "lobby";
  if (room === "hallway") return "recreation";
  if (room === "executive_suite") return ownOfficeRoom === "executive" ? "executive_suite" : null;
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
      { x: 9_030, y: 0, width: 3_940, height: 25_000 },
      { x: 0, y: 11_030, width: 8_970, height: 2_940 },
      { x: 13_030, y: 11_030, width: 8_970, height: 2_940 },
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
        { x: 12_500, y: 5_000, hx: 230, hy: 260 },
        { x: 12_500, y: 8_000, hx: 230, hy: 260 },
      ]
      : room === "executive_suite"
        ? [
          { x: 0, y: 5_500, hx: 220, hy: 90 },
          { x: 2_500, y: 6_400, hx: 220, hy: 90 },
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

const EXECUTIVE_SUITE_DOOR = { x: 2_500, y: 4_600 };

function isNearExecutiveSuiteDoor(point: Position): boolean {
  return Math.hypot(point.x - EXECUTIVE_SUITE_DOOR.x, point.y - EXECUTIVE_SUITE_DOOR.y) <= 600;
}

export function isWalkableBuildingPosition(room: string, point: Position): boolean {
  return pointIsWalkable(room, point);
}

export function isNearTowerElevator(floorNumber: number, point: Position): boolean {
  const elevator = TOWER_ELEVATOR_POSITIONS[floorNumber];
  const locations = [
    ...(TOWER_PASSENGER_ELEVATOR_POSITIONS[floorNumber] ?? []),
    ...(TOWER_SERVICE_ELEVATOR_POSITIONS[floorNumber] ? [TOWER_SERVICE_ELEVATOR_POSITIONS[floorNumber]] : []),
    ...(elevator ? [elevator] : []),
  ];
  return locations.some((location) => Math.hypot(point.x - location.x, point.y - location.y)
    <= TOWER_ELEVATOR_INTERACTION_RADIUS);
}

export function isNearTowerServiceElevator(floorNumber: number, point: Position): boolean {
  const service = TOWER_SERVICE_ELEVATOR_POSITIONS[floorNumber];
  if (!service) return false;
  const serviceDistance = Math.hypot(point.x - service.x, point.y - service.y);
  if (serviceDistance > TOWER_ELEVATOR_INTERACTION_RADIUS) return false;

  const passengerPositions = [
    ...(TOWER_PASSENGER_ELEVATOR_POSITIONS[floorNumber] ?? []),
    ...(TOWER_ELEVATOR_POSITIONS[floorNumber] ? [TOWER_ELEVATOR_POSITIONS[floorNumber]] : []),
  ];
  const nearestPassengerDistance = passengerPositions.length
    ? Math.min(...passengerPositions.map((position) =>
      Math.hypot(point.x - position.x, point.y - position.y)))
    : Number.POSITIVE_INFINITY;
  return serviceDistance < nearestPassengerDistance;
}

export function isNearTowerStairwell(floorNumber: number, point: Position, stairwell: number): boolean {
  const position = TOWER_STAIRWELL_POSITIONS[floorNumber]?.[stairwell - 1];
  return position != null && Math.hypot(point.x - position.x, point.y - position.y)
    <= TOWER_STAIRWELL_INTERACTION_RADIUS;
}

export function validateBuildingPresence(
  previous: PresenceForValidation | null,
  next: { room: BuildingPresenceRoom; roomKey: string; floorNumber: number; linkId: string; x: number; y: number },
  now: Date,
  ownOfficeRoom: string | null,
): string | null {
  if (!Number.isInteger(next.floorNumber) || !PLAYABLE_TOWER_FLOORS.has(next.floorNumber)) {
    return "Floor is under construction";
  }
  const catalogRoom = catalogRoomForPresence(next.room, ownOfficeRoom);
  if (!catalogRoom || !pointIsWalkable(catalogRoom, next)) {
    return "Position is outside the walkable building room";
  }
  const spawn = ROOM_SPAWNS[catalogRoom];
  const elevatorAuthorized = previous?.linkId === next.linkId
    && previous.room === "elevator"
    && previous.destinationFloor === next.floorNumber;
  const stairAuthorized = previous?.linkId === next.linkId
    && previous.action === "stair"
    && previous.destinationFloor === next.floorNumber
    && Math.abs(previous.floorNumber - next.floorNumber) === 1;
  const previousIsStale = previous != null
    && (previous.linkId !== next.linkId
      || now.getTime() - previous.lastSeenAt.getTime() > BUILDING_PRESENCE_MAX_AGE_MS);
  const canRecoverToLobby = next.floorNumber === 1
    && previousIsStale
    && Math.hypot(next.x - spawn.x, next.y - spawn.y) <= 350;
  if (next.floorNumber >= 2 && next.floorNumber <= 12
    && previous?.floorNumber !== next.floorNumber
    && !elevatorAuthorized && !stairAuthorized) {
    return "Use a passenger elevator or stairwell to enter this floor";
  }
  if (previous?.room === "elevator" && !elevatorAuthorized && !canRecoverToLobby) {
    return "The elevator is not traveling to this floor";
  }
  if (previous && previous.floorNumber !== next.floorNumber && !elevatorAuthorized && !stairAuthorized) {
    if (!canRecoverToLobby) {
      return "Use an elevator or stairwell to travel between floors";
    }
  }
  if (!previous || previous.linkId !== next.linkId
    || previous.room !== next.room || previous.roomKey !== next.roomKey
    || previous.floorNumber !== next.floorNumber) {
    if (next.room === "executive_suite") {
      const officeKey = next.roomKey.endsWith(":suite")
        ? next.roomKey.slice(0, -":suite".length)
        : null;
      if (!previous || previous.room !== "office" || previous.roomKey !== officeKey
        || previous.floorNumber !== next.floorNumber || !isNearExecutiveSuiteDoor(previous)) {
        return "Enter the executive suite through its marked door";
      }
    }
    if (previous?.room === "executive_suite" && next.room === "office") {
      if (previous.roomKey !== `${next.roomKey}:suite`
        || previous.floorNumber !== next.floorNumber
        || !isNearExecutiveSuiteDoor(previous)) {
        return "Exit the executive suite through its marked door";
      }
    }
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
