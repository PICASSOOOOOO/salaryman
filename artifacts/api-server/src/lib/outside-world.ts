import {
  db,
  eventResponsesTable,
  subwayStationsTable,
  subwayTripsTable,
  userDiscoveredStationsTable,
  worldEventsTable,
  worldKvTable,
  worldPlayerPositionsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/**
 * SALARYMAN is intentionally operating in building-only mode.
 *
 * Keep this as a code-level product boundary rather than an environment flag:
 * deployments must not accidentally reactivate the exterior city while the
 * office/tower experience is being mastered.
 */
export const OUTSIDE_WORLD_ENABLED = false;

export const OUTSIDE_WORLD_DISABLED_BODY = {
  error: "Outside world is locked",
  code: "OUTSIDE_WORLD_LOCKED",
  message: "SALARYMAN is focused on the active office and tower floors.",
} as const;

const BUILDING_ONLY_PURGE_KEY = "building_only_purge_v1";

/**
 * One-time removal of transient exterior state. Deliberately preserves player
 * identity, businesses, organizations, money, billing, tower floors, offices,
 * property contracts, and all automation data.
 */
export async function purgeOutsideWorldState(): Promise<boolean> {
  if (OUTSIDE_WORLD_ENABLED) return false;

  const [alreadyPurged] = await db
    .select({ value: worldKvTable.value })
    .from(worldKvTable)
    .where(eq(worldKvTable.key, BUILDING_ONLY_PURGE_KEY))
    .limit(1);
  if (alreadyPurged?.value === 1) return false;

  await db.transaction(async (tx) => {
    await tx.delete(eventResponsesTable);
    await tx.delete(worldEventsTable);
    await tx.delete(worldPlayerPositionsTable);
    await tx.delete(userDiscoveredStationsTable);
    await tx.delete(subwayTripsTable);
    await tx.delete(subwayStationsTable);
    await tx.delete(worldKvTable).where(
      inArray(worldKvTable.key, ["city_liberation_progress", BUILDING_ONLY_PURGE_KEY]),
    );
    await tx.insert(worldKvTable).values({ key: BUILDING_ONLY_PURGE_KEY, value: 1 });
  });

  return true;
}