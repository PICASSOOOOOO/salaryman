import { describe, expect, it } from "vitest";
import {
  PLAYABLE_TOWER_FLOORS,
  TOWER_ELEVATOR_POSITIONS,
  TOWER_PASSENGER_ELEVATOR_POSITIONS,
  TOWER_SERVICE_ELEVATOR_POSITIONS,
  TOWER_STAIRWELL_POSITIONS,
  isNearTowerElevator,
  isNearTowerServiceElevator,
  isNearTowerStairwell,
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

  it("opens Floors 1–12, retains the construction-open Floors 2–5, and locks upper floors", () => {
    expect([...PLAYABLE_TOWER_FLOORS].sort((a, b) => a - b))
      .toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(isNearTowerElevator(1, lobby)).toBe(true);
    expect(isNearTowerElevator(6, floorSixHallway)).toBe(true);
    expect(isNearTowerElevator(2, TOWER_PASSENGER_ELEVATOR_POSITIONS[2][0])).toBe(true);
    expect(isNearTowerElevator(8, TOWER_PASSENGER_ELEVATOR_POSITIONS[8][0])).toBe(true);
    expect(TOWER_STAIRWELL_POSITIONS[12]).toHaveLength(1);
    expect(isNearTowerStairwell(12, TOWER_STAIRWELL_POSITIONS[12][0], 1)).toBe(true);
    expect(isNearTowerStairwell(12, { x: 12_500, y: 12_500 }, 2)).toBe(false);
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

  it("allows Floors 7–12 only through elevator or stair travel and keeps Floors 13–67 under construction", () => {
    const floorSevenHallway = { ...floorSixHallway, floorNumber: 7, roomKey: "hallway:minx_city:7" };
    const floorEightHallway = { ...floorSixHallway, floorNumber: 8, roomKey: "hallway:minx_city:8" };
    const floorTwelveHallway = { ...floorSixHallway, floorNumber: 12, roomKey: "hallway:minx_city:12" };
    const floorThirteenHallway = { ...floorSixHallway, floorNumber: 13, roomKey: "hallway:minx_city:13" };
    const elevatorAtLobby = {
      ...lobby,
      room: "elevator" as const,
      destinationFloor: 7,
      x: TOWER_ELEVATOR_POSITIONS[1].x,
      y: TOWER_ELEVATOR_POSITIONS[1].y,
    };
    expect(validateBuildingPresence(elevatorAtLobby, floorSevenHallway, now, "executive")).toBeNull();
    expect(validateBuildingPresence(lobby, floorEightHallway, now, "executive"))
      .toBe("Use a passenger elevator or stairwell to enter this floor");
    expect(validateBuildingPresence(lobby, floorThirteenHallway, now, "executive"))
      .toBe("Floor is under construction");

    const elevatorToFloorEight = {
      ...lobby,
      room: "elevator" as const,
      destinationFloor: 8,
      x: TOWER_ELEVATOR_POSITIONS[1].x,
      y: TOWER_ELEVATOR_POSITIONS[1].y,
    };
    expect(validateBuildingPresence(elevatorToFloorEight, floorEightHallway, now, "executive")).toBeNull();

    const elevatorAtFloorSeven = {
      ...floorSevenHallway,
      room: "elevator" as const,
      destinationFloor: 1,
      x: TOWER_ELEVATOR_POSITIONS[7].x,
      y: TOWER_ELEVATOR_POSITIONS[7].y,
    };
    expect(validateBuildingPresence(elevatorAtFloorSeven, lobby, now, null)).toBeNull();
    const stairToFloorTwelve = {
      ...floorSevenHallway,
      floorNumber: 11,
      roomKey: "hallway:minx_city:11",
      room: "elevator" as const,
      action: "stair",
      destinationFloor: 12,
      x: TOWER_STAIRWELL_POSITIONS[11][1].x,
      y: TOWER_STAIRWELL_POSITIONS[11][1].y,
    };
    expect(validateBuildingPresence(stairToFloorTwelve, floorTwelveHallway, now, "executive")).toBeNull();
  });

  it("provides passenger and service elevator stops through Floor 12 without opening Floor 13", () => {
    expect(PLAYABLE_TOWER_FLOORS.has(6)).toBe(true);
    expect(PLAYABLE_TOWER_FLOORS.has(8)).toBe(true);
    expect(PLAYABLE_TOWER_FLOORS.has(12)).toBe(true);
    expect(PLAYABLE_TOWER_FLOORS.has(13)).toBe(false);
    expect(isNearTowerServiceElevator(12, TOWER_SERVICE_ELEVATOR_POSITIONS[12])).toBe(true);
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
