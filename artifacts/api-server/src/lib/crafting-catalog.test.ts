import { describe, it, expect } from "vitest";
import {
  CRAFT_RECIPES,
  getCraftRecipe,
  computeMissingInputs,
  canCraft,
  isUtilityOutput,
  type CraftAvailability,
} from "./crafting-catalog";
import { findCatalogItem, CONSUMABLE_TYPES } from "./item-catalog";
import { getResourceDef as resDef } from "./resource-catalog";

describe("crafting-catalog integrity", () => {
  it("exposes a non-empty flat recipe set", () => {
    expect(CRAFT_RECIPES.length).toBeGreaterThan(0);
  });

  it("every recipe output exists and is NEVER a utility good (battery/fuel)", () => {
    for (const r of CRAFT_RECIPES) {
      const out = findCatalogItem(r.output.itemId);
      expect(out, `output ${r.output.itemId} of ${r.id}`).toBeTruthy();
      expect(isUtilityOutput(r.output.itemId), `${r.id} must not output a utility good`).toBe(false);
      expect(r.output.qty).toBeGreaterThanOrEqual(1);
    }
  });

  it("every input references a real resource or a stackable material", () => {
    for (const r of CRAFT_RECIPES) {
      for (const inp of r.inputs) {
        expect(inp.qty).toBeGreaterThanOrEqual(1);
        if (inp.kind === "resource") {
          expect(resDef(inp.id), `resource ${inp.id} in ${r.id}`).toBeTruthy();
        } else {
          const it = findCatalogItem(inp.id);
          expect(it, `item ${inp.id} in ${r.id}`).toBeTruthy();
          expect((CONSUMABLE_TYPES as readonly string[]).includes(it!.type)).toBe(true);
        }
      }
    }
  });
});

describe("getCraftRecipe", () => {
  it("returns a known recipe and undefined for unknown ids", () => {
    expect(getCraftRecipe("refine_scrap")?.id).toBe("refine_scrap");
    expect(getCraftRecipe("nope")).toBeUndefined();
  });
});

describe("computeMissingInputs / canCraft", () => {
  const scrap = getCraftRecipe("refine_scrap")!; // 3x iron_scrap (resource)
  const visor = getCraftRecipe("craft_visor")!; // 2x mat_copper + 1x mat_silicon (items)

  it("reports nothing missing when fully supplied", () => {
    const avail: CraftAvailability = { resources: { iron_scrap: 5 }, items: {} };
    expect(computeMissingInputs(scrap, avail)).toEqual([]);
    expect(canCraft(scrap, avail)).toBe(true);
  });

  it("reports the shortfall when a resource input is insufficient", () => {
    const avail: CraftAvailability = { resources: { iron_scrap: 1 }, items: {} };
    const missing = computeMissingInputs(scrap, avail);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ kind: "resource", id: "iron_scrap", qty: 3, have: 1 });
    expect(canCraft(scrap, avail)).toBe(false);
  });

  it("treats absent inputs as zero held", () => {
    const avail: CraftAvailability = { resources: {}, items: {} };
    expect(canCraft(scrap, avail)).toBe(false);
  });

  it("checks item-kind inputs against the items ledger", () => {
    expect(canCraft(visor, { resources: {}, items: { mat_copper: 2, mat_silicon: 1 } })).toBe(true);
    expect(canCraft(visor, { resources: {}, items: { mat_copper: 2 } })).toBe(false);
  });
});

describe("isUtilityOutput", () => {
  it("flags battery/fuel items and passes gear/materials", () => {
    expect(isUtilityOutput("mat_scrap")).toBe(false);
    expect(isUtilityOutput("equip_gasmask")).toBe(false);
    // any catalog battery/fuel item should be rejected
    const battery = ["battery_aa", "battery_pack", "fuel_can", "fuel_cell"].find((id) => {
      const it = findCatalogItem(id);
      return it && (it.type === "battery" || it.type === "fuel");
    });
    if (battery) expect(isUtilityOutput(battery)).toBe(true);
  });
});
