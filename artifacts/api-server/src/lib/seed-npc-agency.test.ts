import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: unknown; conflict: boolean }>,
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  brandFactionsTable: { id: "brand_factions.id" },
  shopLocationBossesTable: { id: "shop_location_bosses.id" },
  db: { transaction: mocked.transaction },
}));

import {
  CONFIRMED_TOWER_NPC_AGENCY,
  seedConfirmedTowerNpcAgency,
} from "./seed-npc-agency";

describe("confirmed Tower NPC agency seed", () => {
  beforeEach(() => {
    mocked.inserts.length = 0;
    mocked.transaction.mockClear();
    mocked.transaction.mockImplementation(async (work: (tx: unknown) => Promise<void>) =>
      work({
        insert: (table: { id: string }) => ({
          values: (row: unknown) => ({
            onConflictDoNothing: async () => {
              mocked.inserts.push({ table: table.id, row, conflict: true });
            },
          }),
        }),
      }),
    );
  });

  it("seeds approved shop owners and preserves conflicts", async () => {
    await seedConfirmedTowerNpcAgency();

    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mocked.inserts).toHaveLength(6);
    expect(mocked.inserts.map((insert) => insert.table)).toEqual([
      "brand_factions.id",
      "brand_factions.id",
      "brand_factions.id",
      "shop_location_bosses.id",
      "shop_location_bosses.id",
      "shop_location_bosses.id",
    ]);
    expect(mocked.inserts.every((insert) => insert.conflict)).toBe(true);
    expect(CONFIRMED_TOWER_NPC_AGENCY).toEqual({
      factions: [
        { id: "tower_florist", name: "BLACK GLASS FLORIST" },
        { id: "tower_gift_shop", name: "LAST LOOK GIFT CO." },
        { id: "tower_laundry", name: "RINSE 67" },
      ],
      bosses: [
        {
          id: "boss-tower-florist-lobby",
          name: "ADA BLOM",
          brandId: "tower_florist",
          shopId: "tower_florist",
          locationId: "shadow-tower:minx-city:lobby:gift-arcade",
          netWorthFiat: 0,
        },
        {
          id: "boss-tower-gift-shop-lobby",
          name: "MARA QUILL",
          brandId: "tower_gift_shop",
          shopId: "lobby_gift_shop",
          locationId: "shadow-tower:minx-city:lobby:arrival-wall",
          netWorthFiat: 0,
        },
        {
          id: "boss-tower-laundry-floor-7",
          name: "ILYA SENN",
          brandId: "tower_laundry",
          shopId: "tower_laundry",
          locationId: "shadow-tower:minx-city:floor-7:service-corridor",
          netWorthFiat: 0,
        },
      ],
    });
  });
});
