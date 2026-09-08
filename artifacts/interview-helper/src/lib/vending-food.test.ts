import { describe, it, expect } from "vitest";
import { VEND_FOOD_ITEMS, parseFoodEffect, foodEnergyRestore } from "./vending-food";

describe("vending-food catalog", () => {
  it("ships a non-empty food list with unique ids", () => {
    expect(VEND_FOOD_ITEMS.length).toBeGreaterThan(0);
    const ids = new Set(VEND_FOOD_ITEMS.map((i) => i.id));
    expect(ids.size).toBe(VEND_FOOD_ITEMS.length);
  });

  it("marks every item as a priced consumable", () => {
    for (const item of VEND_FOOD_ITEMS) {
      expect(item.consumable).toBe(true);
      expect(item.price).toBeGreaterThan(0);
      expect(item.effect.length).toBeGreaterThan(0);
    }
  });

  it("includes recognizable stamina-restoring food", () => {
    const energyDrink = VEND_FOOD_ITEMS.find((i) => i.id === "energy_drink");
    expect(energyDrink).toBeDefined();
    expect(foodEnergyRestore(energyDrink!.effect)).toBe(60);
  });
});

describe("parseFoodEffect", () => {
  it("parses combined survival deltas", () => {
    expect(parseFoodEffect("hunger50 energy15")).toEqual({
      hunger: 50, thirst: 0, energy: 15, hp: 0, power: 0, curePoison: false, hpRisk: false,
    });
  });

  it("handles the negative thirst token", () => {
    const d = parseFoodEffect("energy60 thirst-10");
    expect(d.energy).toBe(60);
    expect(d.thirst).toBe(-10);
  });

  it("distinguishes hp gain from the hprisk token", () => {
    const heal = parseFoodEffect("hp50");
    expect(heal.hp).toBe(50);
    expect(heal.hpRisk).toBe(false);

    const risky = parseFoodEffect("thirst30 energy15 hprisk5");
    expect(risky.hp).toBe(0);
    expect(risky.hpRisk).toBe(true);
    expect(risky.thirst).toBe(30);
    expect(risky.energy).toBe(15);
  });

  it("parses cure_poison and grid power", () => {
    expect(parseFoodEffect("cure_poison").curePoison).toBe(true);
    expect(parseFoodEffect("power35").power).toBe(35);
  });

  it("returns zeros for an empty effect", () => {
    expect(parseFoodEffect("")).toEqual({
      hunger: 0, thirst: 0, energy: 0, hp: 0, power: 0, curePoison: false, hpRisk: false,
    });
  });
});
