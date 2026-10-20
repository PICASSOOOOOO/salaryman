import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  insertCalls: [] as Array<{ table: string; row: unknown; conflict: unknown }>,
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  brandFactionsTable: { id: "brand_factions.id" },
  shopLocationBossesTable: { id: "shop_location_bosses.id" },
  db: { transaction: mocked.transaction },
}));

import { persistSharedNpcAgencySnapshot } from "./npc-agency-store";

describe("shared NPC agency persistence", () => {
  beforeEach(() => {
    mocked.insertCalls.length = 0;
    mocked.transaction.mockClear();
    mocked.transaction.mockImplementation(async (work: (tx: unknown) => Promise<void>) =>
      work({
        insert: (table: { id: string }) => ({
          values: (row: unknown) => ({
            onConflictDoUpdate: async (conflict: unknown) => {
              mocked.insertCalls.push({ table: table.id, row, conflict });
            },
          }),
        }),
      }),
    );
  });

  it("upserts shared factions before their per-location bosses in one transaction", async () => {
    const snapshot = {
      factions: [{ id: "brand-common-table", name: "Common Table" }],
      bosses: [
        { id: "boss-floor-2", name: "Mira", brandId: "brand-common-table", shopId: "common-table", locationId: "floor-2", netWorthFiat: 100 },
        { id: "boss-floor-5", name: "Noah", brandId: "brand-common-table", shopId: "common-table", locationId: "floor-5", netWorthFiat: 200 },
      ],
    };

    await persistSharedNpcAgencySnapshot(snapshot);

    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mocked.insertCalls.map((call) => call.table)).toEqual([
      "brand_factions.id",
      "shop_location_bosses.id",
      "shop_location_bosses.id",
    ]);
    expect(mocked.insertCalls.map((call) => (call.row as { id: string }).id)).toEqual([
      "brand-common-table",
      "boss-floor-2",
      "boss-floor-5",
    ]);
  });

  it("rejects invalid snapshots before opening a database transaction", async () => {
    await expect(persistSharedNpcAgencySnapshot({
      factions: [],
      bosses: [{
        id: "boss-no-brand",
        name: "No Brand",
        brandId: "missing",
        shopId: "shop",
        locationId: "floor-1",
        netWorthFiat: 0,
      }],
    })).rejects.toThrow("references an unknown brand");

    expect(mocked.transaction).not.toHaveBeenCalled();
  });
});
