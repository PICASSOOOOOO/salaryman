import { describe, expect, it } from "vitest";
import { getShadowTowerCommercialTenants } from "@workspace/api-zod/shadow-tower";
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
    expect(getTowerFloorIdentity(12)).toMatchObject({
      status: "occupied",
      label: "NOIR RESERVATION",
      tenantKey: "tower_restaurant",
      tenantService: "Dining, private rooms, corporate tables",
    });
    expect(getTowerFloorIdentity(13)).toMatchObject({
      status: "available",
      label: "COMMERCIAL FLOOR 13",
    });
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

  it("keeps catalog occupants out of vacant-floor identities", () => {
    expect(getShadowTowerCommercialTenants(13)).toHaveLength(0);
    expect(getShadowTowerCommercialTenants(18).map((tenant) => tenant.business.name)).toEqual([
      "VALE PRIVATE MEDICINE",
      "BITE//BYTE DENTAL",
    ]);
  });
});