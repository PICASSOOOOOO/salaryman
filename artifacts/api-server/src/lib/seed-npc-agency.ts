import {
  brandFactionsTable,
  db,
  shopLocationBossesTable,
} from "@workspace/db";
import {
  validateNpcAgencySnapshot,
  type NpcAgencySnapshot,
} from "./npc-agency";

/**
 * Includes explicitly confirmed or user-approved Tower shop owners. Existing
 * named staff/operators remain in their current roles and are not promoted.
 */
export const CONFIRMED_TOWER_NPC_AGENCY: NpcAgencySnapshot = {
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
      // The schema requires a starting value; keep it at its neutral default.
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
};

/**
 * Seed confirmed Tower owners without changing rows already authored in the
 * shared world. Safe to run on every API boot.
 */
export async function seedConfirmedTowerNpcAgency(): Promise<void> {
  const errors = validateNpcAgencySnapshot(CONFIRMED_TOWER_NPC_AGENCY);
  if (errors.length > 0) {
    throw new Error(`Invalid confirmed Tower NPC agency seed: ${errors.join("; ")}`);
  }

  await db.transaction(async (tx) => {
    for (const faction of CONFIRMED_TOWER_NPC_AGENCY.factions) {
      await tx.insert(brandFactionsTable).values(faction).onConflictDoNothing();
    }
    for (const boss of CONFIRMED_TOWER_NPC_AGENCY.bosses) {
      await tx.insert(shopLocationBossesTable).values(boss).onConflictDoNothing();
    }
  });
}
