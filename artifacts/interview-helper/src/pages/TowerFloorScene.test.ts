import { describe, expect, it } from "vitest";
import { getTowerFloorIdentity } from "./TowerFloorScene";

describe("TowerFloorScene floor coverage", () => {
  it("gives every numbered floor a physical identity", () => {
    for (let floor = 1; floor <= 67; floor += 1) {
      const identity = getTowerFloorIdentity(floor);
      expect(identity.floor).toBe(floor);
      expect(identity.shortLabel).toBe(`F${floor}`);
      expect(identity.label).toBeTruthy();
      expect(identity.detail).toBeTruthy();
      expect(identity.accessLabel).toBeTruthy();
    }
  });

  it("keeps service, sealed, executive, and restricted floors distinct", () => {
    expect(getTowerFloorIdentity(-1)).toMatchObject({
      shortLabel: "B1",
      status: "service",
      accessLabel: "OPERATIONS ACCESS",
    });
    expect(getTowerFloorIdentity(12).status).toBe("available");
    expect(getTowerFloorIdentity(40).status).toBe("sealed");
    expect(getTowerFloorIdentity(52).status).toBe("sealed");
    expect(getTowerFloorIdentity(65).status).toBe("sealed");
    expect(getTowerFloorIdentity(66)).toMatchObject({
      label: "PICASSO EXECUTIVE FLOOR",
      status: "occupied",
    });
    expect(getTowerFloorIdentity(67)).toMatchObject({
      label: "SHADOW CORP ROOFLINE",
      status: "restricted",
    });
  });
});