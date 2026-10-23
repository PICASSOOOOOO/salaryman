import { describe, expect, it } from "vitest";
import {
  chooseNpcShelfRestock,
  chooseNpcShopRestockItem,
  listNpcShopRestockCandidates,
} from "./tower-shop-autopilot";

describe("chooseNpcShelfRestock", () => {
  it("moves a measured top-up from storage when the shelf is low", () => {
    expect(chooseNpcShelfRestock({ stored: 50, shelf: 3, shelfCapacity: 100 })).toBe(17);
  });

  it("respects stored quantity and remaining shelf capacity", () => {
    expect(chooseNpcShelfRestock({ stored: 5, shelf: 2, shelfCapacity: 6 })).toBe(4);
  });

  it("does not refill a healthy shelf or an empty store room", () => {
    expect(chooseNpcShelfRestock({ stored: 20, shelf: 5, shelfCapacity: 100 })).toBe(0);
    expect(chooseNpcShelfRestock({ stored: 0, shelf: 0, shelfCapacity: 100 })).toBe(0);
  });
});

describe("chooseNpcShopRestockItem", () => {
  it("orders a small top-up when the shelf and storage are nearly empty", () => {
    expect(chooseNpcShopRestockItem({
      itemIds: ["furn_desk"],
      stockByItem: new Map([["furn_desk", 3]]),
      storageCapacityByItem: new Map([["furn_desk", 20]]),
    })).toEqual({ itemId: "furn_desk", quantity: 9 });
  });

  it("does not reorder well-stocked, in-flight, or cooldown items", () => {
    expect(chooseNpcShopRestockItem({
      itemIds: ["well-stocked", "in-flight", "rare"],
      stockByItem: new Map([["well-stocked", 5], ["in-flight", 0], ["rare", 0]]),
      storageCapacityByItem: new Map(),
      blockedItemIds: new Set(["in-flight", "rare"]),
    })).toBeNull();
  });

  it("never exceeds remaining storage capacity", () => {
    expect(chooseNpcShopRestockItem({
      itemIds: ["furn_desk"],
      stockByItem: new Map([["furn_desk", 2]]),
      storageCapacityByItem: new Map([["furn_desk", 7]]),
    })).toEqual({ itemId: "furn_desk", quantity: 5 });
  });

  it("selects the lowest-stock item, with catalog order as a stable tie-breaker", () => {
    expect(chooseNpcShopRestockItem({
      itemIds: ["first", "second", "third"],
      stockByItem: new Map([["first", 2], ["second", 0], ["third", 0]]),
      storageCapacityByItem: new Map(),
    })).toEqual({ itemId: "second", quantity: 12 });
  });

  it("prioritizes common goods ahead of lower-stock non-common goods", () => {
    expect(chooseNpcShopRestockItem({
      itemIds: ["rare-item", "common-item"],
      stockByItem: new Map([["rare-item", 0], ["common-item", 4]]),
      storageCapacityByItem: new Map(),
      priorityItemIds: new Set(["common-item"]),
    })).toEqual({ itemId: "common-item", quantity: 8 });
  });

  it("keeps affordable fallback items available when the first SKU is too expensive", () => {
    expect(listNpcShopRestockCandidates({
      itemIds: ["expensive", "affordable"],
      stockByItem: new Map(),
      storageCapacityByItem: new Map(),
    })).toEqual([
      { itemId: "expensive", quantity: 12 },
      { itemId: "affordable", quantity: 12 },
    ]);
  });
});
