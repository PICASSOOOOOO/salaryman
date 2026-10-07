import { describe, expect, it } from "vitest";
import {
  PLAYABLE_TOWER_FLOORS,
  TOWER_ELEVATOR_POSITIONS,
  TOWER_PASSENGER_ELEVATOR_POSITIONS,
  TOWER_SERVICE_ELEVATOR_POSITIONS,
  isNearTowerElevator,
  isNearTowerServiceElevator,
  validateBuildingPresence,
} from "./desktop-building-objects";

describe("desktop tower floor travel", () => {
  const now = new Date("2026-10-07T00:00:00.000Z");
  const lobby = {
    room: "lobby" as const,
    roomKey: "lobby:minx_city",
    floorNumber: 1,
    linkId: "desktop-link",
    x: 49_978_000,
    y: 50_000_000,
    lastSeenAt: now,
  };
  const floorSixHallway = {
    room: "hallway" as const,
    roomKey: "hallway:minx_city:6",
    floorNumber: 6,
    linkId: "desktop-link",
    x: 11_000,
    y: 1_500,
    lastSeenAt: now,
  };

  it("opens the lobby, construction Floors 2–5, and Floor 6 while keeping upper floors closed", () => {
    expect([...PLAYABLE_TOWER_FLOORS].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isNearTowerElevator(1, lobby)).toBe(true);
    expect(isNearTowerElevator(6, floorSixHallway)).toBe(true);
    expect(isNearTowerElevator(2, TOWER_PASSENGER_ELEVATOR_POSITIONS[2][0])).toBe(true);
    expect(isNearTowerElevator(7, lobby)).toBe(false);
    expect(isNearTowerServiceElevator(2, TOWER_SERVICE_ELEVATOR_POSITIONS[2])).toBe(true);
    expect(isNearTowerServiceElevator(2, TOWER_PASSENGER_ELEVATOR_POSITIONS[2][0])).toBe(false);
  });

  it("rejects a direct lobby-to-office-floor transition and accepts an authorized elevator trip", () => {
    expect(validateBuildingPresence(lobby, floorSixHallway, now, "executive"))
      .toBe("Use a passenger elevator or stairwell to enter this floor");
    const elevatorAtLobby = {
      ...lobby,
      room: "elevator" as const,
      destinationFloor: 6,
      x: TOWER_ELEVATOR_POSITIONS[1].x,
      y: TOWER_ELEVATOR_POSITIONS[1].y,
    };
    expect(validateBuildingPresence(elevatorAtLobby, floorSixHallway, now, "executive")).toBeNull();
  });

  it("keeps Floors 7–67 locked and permits the authorized return trip", () => {
    const closedFloor = { ...floorSixHallway, floorNumber: 7 };
    expect(validateBuildingPresence(lobby, closedFloor, now, "executive")).toBe("Floor is under construction");

    const elevatorAtFloorSix = {
      ...floorSixHallway,
      room: "elevator" as const,
      destinationFloor: 1,
      x: TOWER_ELEVATOR_POSITIONS[6].x,
      y: TOWER_ELEVATOR_POSITIONS[6].y,
    };
    expect(validateBuildingPresence(elevatorAtFloorSix, lobby, now, null)).toBeNull();
  });

  it("allows stale elevator presence to recover only at the lobby spawn", () => {
    const abandonedElevator = {
      room: "elevator" as const,
      roomKey: "elevator:minx_city",
      floorNumber: 6,
      destinationFloor: 6,
      linkId: "old-link",
      x: TOWER_ELEVATOR_POSITIONS[6].x,
      y: TOWER_ELEVATOR_POSITIONS[6].y,
      lastSeenAt: new Date(now.getTime() - 11_000),
    };
    expect(validateBuildingPresence(abandonedElevator, lobby, now, null)).toBeNull();
    expect(validateBuildingPresence(
      abandonedElevator,
      { ...lobby, x: lobby.x + 1_000 },
      now,
      null,
    )).toBe("The elevator is not traveling to this floor");
  });
});
