import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/routes/marketplace.ts"), "utf8");

function routeSource(startText: string, endText: string): string {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("unified marketplace route contract", () => {
  it("normalizes all four supported listing sources and applies city/mine filters", () => {
    const route = routeSource('router.get("/marketplace/feed"', '// POST /marketplace/items');
    expect(route).toContain("businessListingsTable");
    expect(route).toContain("realEstateListingsTable");
    expect(route).toContain("fleetVehiclesTable");
    expect(route).toContain("marketplaceItemListingsTable");
    expect(route).toContain("activeListingBase");
    expect(route).toContain("cityMatches(listing.sourceCityId, city)");
    expect(route).toContain("!mine || listing.mine");
    expect(route).toContain("nextOffset");
  });

  it("requires login and escrows only item quantities owned by the selected character", () => {
    const route = routeSource('router.post("/marketplace/items"', '// DELETE /marketplace/items');
    expect(route).toContain("requireAuth(req, res)");
    expect(route).toContain("findCatalogItem(itemId)");
    expect(route).toContain("eq(playerInventoryTable.userId, userId)");
    expect(route).toContain("eq(playerInventoryTable.slotIndex, slotIndex)");
    expect(route).toContain("inventory.quantity < quantity");
    expect(route).toContain("status: \"active\"");
    expect(route).toContain("escrowed: true");
    expect(route).toContain("sellerSlot: slotIndex");
  });

  it("only lets the item seller cancel an active listing", () => {
    const route = source.slice(source.indexOf('router.delete("/marketplace/items/:id"'));
    expect(route).toContain("requireAuth(req, res)");
    expect(route).toContain("eq(marketplaceItemListingsTable.sellerId, userId)");
    expect(route).toContain('eq(marketplaceItemListingsTable.status, "active")');
    expect(route).toContain('status: "cancelled"');
    expect(route).toContain("restoreEscrowedItem");
  });

  it("settles item purchases atomically between buyer, seller, listing, and inventory", () => {
    const route = routeSource('router.post("/marketplace/items/:id/buy"', "export default router");
    expect(route).toContain("spendFiat(tx");
    expect(route).toContain("creditFiat(tx");
    expect(route).toContain('set({ status: "sold"');
    expect(route).toContain("ITEM_CAPACITY");
    expect(route).toContain("listing.sellerSlot");
  });
});