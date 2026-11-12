import { asc } from "drizzle-orm";
import {
  brandFactionsTable,
  db,
  shopLocationBossesTable,
} from "@workspace/db";
import {
  validateNpcAgencySnapshot,
  type NpcAgencySnapshot,
} from "./npc-agency";

/** Read the shared world roster; these records are deliberately not user-scoped. */
export async function getSharedNpcAgencySnapshot(): Promise<NpcAgencySnapshot> {
  const [factions, bosses] = await Promise.all([
    db.select({
      id: brandFactionsTable.id,
      name: brandFactionsTable.name,
    }).from(brandFactionsTable).orderBy(asc(brandFactionsTable.id)),
    db.select({
      id: shopLocationBossesTable.id,
      name: shopLocationBossesTable.name,
      brandId: shopLocationBossesTable.brandId,
      shopId: shopLocationBossesTable.shopId,
      locationId: shopLocationBossesTable.locationId,
      netWorthFiat: shopLocationBossesTable.netWorthFiat,
    }).from(shopLocationBossesTable).orderBy(asc(shopLocationBossesTable.locationId)),
  ]);

  return { factions, bosses };
}

/**
 * Atomically upsert shared factions and location bosses.
 * Omitted rows are preserved; this operation never deletes world state.
 */
export async function persistSharedNpcAgencySnapshot(
  snapshot: NpcAgencySnapshot,
): Promise<void> {
  const errors = validateNpcAgencySnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Invalid NPC agency snapshot: ${errors.join("; ")}`);
  }

  await db.transaction(async (tx) => {
    for (const faction of snapshot.factions) {
      await tx.insert(brandFactionsTable).values(faction).onConflictDoUpdate({
        target: brandFactionsTable.id,
        set: { name: faction.name, updatedAt: new Date() },
      });
    }

    for (const boss of snapshot.bosses) {
      await tx.insert(shopLocationBossesTable).values(boss).onConflictDoUpdate({
        target: shopLocationBossesTable.id,
        set: {
          name: boss.name,
          brandId: boss.brandId,
          shopId: boss.shopId,
          locationId: boss.locationId,
          netWorthFiat: boss.netWorthFiat,
          updatedAt: new Date(),
        },
      });
    }
  });
}
