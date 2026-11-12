import { describe, expect, it } from "vitest";
import {
  NINETEEN_NINETY_NINE_TERMINAL_ID,
  buildingObject,
  canPlace1999TerminalInSpace,
  isWalkableBuildingPosition,
  playerPlaceableObjectForRoom,
  terminalPlacementOwnerKey,
} from "./desktop-building-objects";

describe("placeable 1999 workstation", () => {
  it.each(["executive", "public", "office_03", "office_04", "executive_suite"])(
    "has a valid, movable terminal in %s",
    (room) => {
      const terminal = playerPlaceableObjectForRoom(room);
      expect(terminal).toMatchObject({
        id: NINETEEN_NINETY_NINE_TERMINAL_ID,
        room,
        material: "electronics",
        movable: true,
        rotatable: true,
      });
      expect(isWalkableBuildingPosition(room, { x: terminal!.x, y: terminal!.y })).toBe(true);
      expect(buildingObject(room, NINETEEN_NINETY_NINE_TERMINAL_ID)).toEqual(terminal);
    },
  );

  it("does not offer placement in public Tower spaces", () => {
    expect(playerPlaceableObjectForRoom("lobby")).toBeNull();
    expect(playerPlaceableObjectForRoom("recreation")).toBeNull();
  });

  it("limits private placements to the owner and organization placements to managers", () => {
    expect(canPlace1999TerminalInSpace({ orgId: null, ownerUserId: "user-a" }, "user-a", false)).toBe(true);
    expect(canPlace1999TerminalInSpace({ orgId: null, ownerUserId: "user-a" }, "user-b", true)).toBe(false);
    expect(canPlace1999TerminalInSpace({ orgId: 42, ownerUserId: null }, "user-a", false)).toBe(false);
    expect(canPlace1999TerminalInSpace({ orgId: 42, ownerUserId: null }, "user-a", true)).toBe(true);
    expect(terminalPlacementOwnerKey({ orgId: 42 }, "user-a")).toBe("org:42");
    expect(terminalPlacementOwnerKey({ orgId: null }, "user-a")).toBe("user:user-a");
  });
});
