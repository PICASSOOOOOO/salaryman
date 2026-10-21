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

  it.each(["vespa_shop", "android_replicant_repair"])(
    "%s has catalog-backed products at its assigned shop",
    (businessKey) => {
    const itemIds = TOWER_BUSINESS_STOCK_LINES
      .filter((line) => line.sellerBusinessKey === businessKey)
      .flatMap((line) => line.itemIds);
    const items = itemIds.map(findCatalogItem).filter((item) => item !== undefined);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.priceFiat > 0)).toBe(true);
    },
  );

  it("keeps terminal repair as an in-person quote rather than inventing a price", () => {
    const terminals = TOWER_BUSINESS_STOCK_LINES.find(
      (line) => line.sellerBusinessKey === "tower_terminal_repair",
    );

    expect(terminals?.priceSource).toBe("seller_quote");
    expect(terminals?.itemIds).toEqual([]);
    expect(terminals?.quoteCategories).toContain("Work terminals and repairs");
  });
});
