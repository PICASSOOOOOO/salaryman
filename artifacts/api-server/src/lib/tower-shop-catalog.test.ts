import { describe, expect, it } from "vitest";
import { TOWER_BUSINESS_STOCK_LINES } from "@workspace/api-zod";
import { findCatalogItem } from "./item-catalog";

describe("autonomous Tower shop catalogs", () => {
  it.each(["fish-store", "book_store"])("%s has affordable catalog stock", (businessKey) => {
    const itemIds = TOWER_BUSINESS_STOCK_LINES
      .filter((line) => line.sellerBusinessKey === businessKey)
      .flatMap((line) => line.itemIds);
    const items = itemIds.map(findCatalogItem).filter((item) => item !== undefined);

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.priceFiat < 25_000)).toBe(true);
  });
});
