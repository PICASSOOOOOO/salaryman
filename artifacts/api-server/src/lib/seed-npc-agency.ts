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
 * The initial roster includes only an explicitly confirmed Tower shop owner.
 * Ada Blom is listed as the owner of Black Glass Florist in TOWER_RESIDENTS;
 * other named residents are staff/operators and are intentionally not promoted.
 */
export const CONFIRMED_TOWER_NPC_AGENCY: NpcAgencySnapshot = {
  factions: [
    { id: "tower_florist", name: "BLACK GLASS FLORIST" },
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
