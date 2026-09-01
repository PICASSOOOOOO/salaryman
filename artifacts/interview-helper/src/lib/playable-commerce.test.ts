import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getFactionPropertyCatalog } from "./property-catalog";
import { isPlayablePropertyKey, PLAYABLE_PROPERTY_KEYS } from "@workspace/api-zod/playable-properties";
import { OFFICE_PROPERTY_LAYOUTS } from "./office-property-layouts";
import { SHADOW_TOWER_LISTINGS } from "@workspace/api-zod/shadow-tower";
import { getOwnedHome, getOwnedOffice, syncOwnedPropertiesLocal } from "./owned-office";

const vendingSource = readFileSync(path.resolve(import.meta.dirname, "../pages/VendingMachine.tsx"), "utf8");
const realtySource = readFileSync(path.resolve(import.meta.dirname, "../pages/RealtyStore.tsx"), "utf8");

describe("playable property inventory", () => {
  it("uses the two Shadow Tower archetypes instead of legacy properties", () => {
    expect(Object.keys(OFFICE_PROPERTY_LAYOUTS)).toEqual(["founder_team", "company"]);
    expect(Object.keys(SHADOW_TOWER_LISTINGS)).toEqual(["founder_team", "company"]);
    expect(realtySource).toContain("SHADOW_TOWER_LISTINGS");
    expect(realtySource).toContain('"/api/shadow-tower/floors"');
    expect(realtySource).toContain("archetype: target.listing.archetype");
  });

  it("keeps unsupported homes out of the playable inventory", () => {
    const catalog = getFactionPropertyCatalog("suit");
    expect(catalog.homes.every((property) => !isPlayablePropertyKey(property.artKey))).toBe(true);
    expect(catalog.offices.every((property) => isPlayablePropertyKey(property.artKey))).toBe(true);
  });
});

describe("simplified commerce surfaces", () => {
  it("removes the dead HOMEBASE vending flow and links to Realty", () => {
    expect(vendingSource).not.toContain('id: "homebase"');
    expect(vendingSource).not.toContain("onChooseHomebase");
    expect(vendingSource).not.toContain("next build");
    expect(vendingSource).toContain('"/store/realty?from=office"');
  });

  it("navigates successful office acquisitions into the playable office", () => {
    expect(realtySource).toContain('navigate("/office")');
  });
});

describe("selected-slot deed hydration", () => {
  it("replaces stale local deed mirrors with the authoritative slot", () => {
    localStorage.setItem("sm_save", JSON.stringify({
      office: { artKey: "property_tower", propertyKey: "property_tower", kind: "office" },
    }));
    const office = {
      artKey: "property_apartment_office",
      propertyKey: "property_apartment_office",
      name: "APARTMENT OFFICE",
      kind: "office" as const,
      tier: "studio" as const,
      tenure: "rent" as const,
      acquiredAt: new Date(0).toISOString(),
    };
    syncOwnedPropertiesLocal(office, null);
    expect(getOwnedOffice()?.propertyKey).toBe("property_apartment_office");
    expect(getOwnedHome()).toBeNull();
  });

  it("clears deeds when the authoritative slot has none", () => {
    localStorage.setItem("sm_save", JSON.stringify({
      office: { artKey: "property_tower", propertyKey: "property_tower", kind: "office" },
      home: { artKey: "property_loft", propertyKey: "property_loft", kind: "home" },
    }));
    syncOwnedPropertiesLocal(null, null);
    expect(getOwnedOffice()).toBeNull();
    expect(getOwnedHome()).toBeNull();
  });
});