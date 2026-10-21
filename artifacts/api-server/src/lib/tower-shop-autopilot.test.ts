import { describe, expect, it } from "vitest";
import { chooseNpcShopRestockItem, listNpcShopRestockCandidates } from "./tower-shop-autopilot";

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
