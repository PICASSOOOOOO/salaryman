import { describe, expect, it } from "vitest";
import { floorPlacementForAssignments } from "./office-monitor";

describe("Shadow Tower bot placement", () => {
  it("places only active bots with an authoritative workstation assignment", () => {
    const placed = floorPlacementForAssignments([
      { id: 9, name: "Unassigned", status: "active", department: "sales", permissions: ["email_send"] },
      { id: 3, name: "Assigned", status: "active", department: "trading", permissions: ["trading_read"] },
      { id: 2, name: "Paused", status: "paused", department: "trading", permissions: ["trading_read"] },
    ], [3, 2]);
    expect(placed.map(bot => bot.id)).toEqual([3]);
    expect(placed[0].teamLabel).toBe("Trading Desk");
  });
});