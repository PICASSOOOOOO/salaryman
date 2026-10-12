import { describe, expect, it } from "vitest";
import {
  resolveOfficeRoomVisibility,
  snapshotOfficeRoom,
} from "./office-room-privacy";
import type { OfficeRoom } from "@/components/office/office-types";

const privateRoom: OfficeRoom = {
  id: "private-suite", x: 4, y: 1, w: 12, h: 8,
  label: "PRIVATE SUITE", accent: "#38bdf8", privacy: "private",
  occupantSeed: 42,
};

describe("private office discovery visibility", () => {
  it("hides undiscovered private rooms and all occupants", () => {
    expect(resolveOfficeRoomVisibility(privateRoom, null, {})).toEqual({ mode: "undiscovered" });
    expect(resolveOfficeRoomVisibility(privateRoom, { col: 2, row: 2 }, {})).toEqual({ mode: "undiscovered" });
  });

  it("shows live contents only while physically inside and keeps occupant data out of snapshots", () => {
    const snapshot = snapshotOfficeRoom(privateRoom);
    expect(snapshot).not.toHaveProperty("occupantSeed");
    expect(resolveOfficeRoomVisibility(privateRoom, null, { [privateRoom.id]: snapshot }))
      .toMatchObject({ mode: "snapshot", room: { label: "PRIVATE SUITE" } });
    expect(resolveOfficeRoomVisibility(privateRoom, { col: 5, row: 2 }, { [privateRoom.id]: snapshot }))
      .toMatchObject({ mode: "live", room: { occupantSeed: 42 } });
  });

  it("keeps public spaces visible without discovery", () => {
    const publicRoom = { ...privateRoom, id: "public-hall", privacy: "public" as const };
    expect(resolveOfficeRoomVisibility(publicRoom, null, {})).toMatchObject({ mode: "live" });
  });
});
