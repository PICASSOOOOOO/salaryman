import {
  db,
  botsTable,
  botSubscriptionsTable,
  botPlatformConnectionsTable,
  autopilotConfigsTable,
  autopilotActivityLogTable,
  adCreativesTable,
  agentProjectsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Pick the canonical bot id for a duplicate group. The instance referenced by
 * the user's bot_subscriptions row wins (so subscriptions and on-screen bots
 * stay in sync); otherwise the oldest row (lowest id) is kept.
 */
export function pickCanonicalBotId(
  groupBotIds: number[],
  subscriptionBotId: number | null | undefined,
): number {
  if (subscriptionBotId != null && groupBotIds.includes(subscriptionBotId)) {
    return subscriptionBotId;
  }
  // groupBotIds are gathered ordered by id ASC, so the first is the oldest.
  return groupBotIds[0];
}

/**
 * Re-point every reference that keys off a bot id from the doomed duplicate
 * rows onto the canonical row, then delete the duplicates. Loose references
 * (no FK) would otherwise dangle; CASCADE references (platform connections,
 * trade data, memory…) would otherwise be destroyed with the duplicate — we
 * preserve platform connections by re-pointing them first. Runs inside the
 * caller's transaction.
 */
async function collapseGroup(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ownerId: string,
  marketplaceItemId: number,
  canonicalId: number,
  duplicateIds: number[],
): Promise<void> {
  if (duplicateIds.length === 0) return;

  // Subscription should point at the canonical instance.
  await tx
    .update(botSubscriptionsTable)
    .set({ botId: canonicalId, status: "active" })
    .where(and(
      eq(botSubscriptionsTable.userId, ownerId),
      eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId),
    ));

  // Preserve platform connections (CASCADE would delete them with the dup).
  await tx
    .update(botPlatformConnectionsTable)
    .set({ botId: canonicalId })
    .where(inArray(botPlatformConnectionsTable.botId, duplicateIds));

  // Loose references (no FK) would dangle — re-point them.
  await tx
    .update(autopilotConfigsTable)
    .set({ botId: canonicalId })
    .where(inArray(autopilotConfigsTable.botId, duplicateIds));
  await tx
    .update(autopilotActivityLogTable)
    .set({ botId: canonicalId })
    .where(inArray(autopilotActivityLogTable.botId, duplicateIds));
  await tx
    .update(adCreativesTable)
    .set({ botId: canonicalId })
    .where(inArray(adCreativesTable.botId, duplicateIds));

  // SET NULL references — preserve the assignment by re-pointing.
  await tx
    .update(agentProjectsTable)
    .set({ assignedBotId: canonicalId })
    .where(inArray(agentProjectsTable.assignedBotId, duplicateIds));

  // Self-reference: any child whose parent is a dup should adopt the canonical.
  await tx
    .update(botsTable)
    .set({ parentBotId: canonicalId })
    .where(inArray(botsTable.parentBotId, duplicateIds));

  // Finally remove the duplicates. Remaining CASCADE tables (trade data,
  // memory, scheduled tasks, conversation logs, oauth sessions) are empty for
  // these bare seeded copies and are cleaned up by the FK cascade.
  await tx.delete(botsTable).where(inArray(botsTable.id, duplicateIds));
}

export interface DedupeResult {
  groupsCollapsed: number;
  botsDeleted: number;
}

/**
 * One-time, idempotent cleanup of duplicate marketplace bot instances.
 *
 * After the PIXEL AGENTS marketplace was consolidated to 9 curated templates,
 * a since-removed bulk seeding path left some owners with dozens of duplicate
 * instances of a single template (each stamped with a random "Firstname Prime"
 * name). The Command Center counts raw instances, so it disagreed with the
 * consolidated roster.
 *
 * This collapses every `(ownerId, marketplaceItemId)` group down to one
 * canonical instance (the one the subscription points at, else the oldest),
 * re-pointing all references first. A second run finds no duplicate groups and
 * is a no-op.
 */
export async function dedupeDuplicateBots(): Promise<DedupeResult> {
  const groups = await db.execute<{ owner_id: string; marketplace_item_id: number }>(sql`
    SELECT owner_id, marketplace_item_id
    FROM bots
    WHERE marketplace_item_id IS NOT NULL
    GROUP BY owner_id, marketplace_item_id
    HAVING count(*) > 1
  `);

  const rows = (groups as unknown as { rows?: Array<{ owner_id: string; marketplace_item_id: number }> }).rows
    ?? (groups as unknown as Array<{ owner_id: string; marketplace_item_id: number }>);

  let groupsCollapsed = 0;
  let botsDeleted = 0;

  for (const group of rows) {
    const ownerId = group.owner_id;
    const marketplaceItemId = Number(group.marketplace_item_id);
    try {
      await db.transaction(async (tx) => {
        const botRows = await tx
          .select({ id: botsTable.id })
          .from(botsTable)
          .where(and(
            eq(botsTable.ownerId, ownerId),
            eq(botsTable.marketplaceItemId, marketplaceItemId),
          ))
          .orderBy(botsTable.id);
        if (botRows.length <= 1) return;

        const [sub] = await tx
          .select({ botId: botSubscriptionsTable.botId })
          .from(botSubscriptionsTable)
          .where(and(
            eq(botSubscriptionsTable.userId, ownerId),
            eq(botSubscriptionsTable.marketplaceItemId, marketplaceItemId),
          ));

        const ids = botRows.map(b => b.id);
        const canonicalId = pickCanonicalBotId(ids, sub?.botId ?? null);
        const duplicateIds = ids.filter(id => id !== canonicalId);

        await collapseGroup(tx, ownerId, marketplaceItemId, canonicalId, duplicateIds);
        groupsCollapsed++;
        botsDeleted += duplicateIds.length;
      });
    } catch (err) {
      console.error(
        `[Bot Dedupe] Failed to collapse owner=${ownerId} item=${marketplaceItemId}:`,
        err,
      );
    }
  }

  if (botsDeleted > 0) {
    console.log(`[Bot Dedupe] Collapsed ${groupsCollapsed} duplicate group(s), removed ${botsDeleted} extra bot instance(s).`);
  }

  return { groupsCollapsed, botsDeleted };
}

/**
 * Find an already-active marketplace bot instance for a user, used by the
 * activation paths to avoid re-inserting a fresh duplicate when a subscription
 * row is missing/orphaned but the bot itself still exists. Returns the oldest
 * matching bot id, or null when none exists.
 */
export async function findExistingMarketplaceBot(
  ownerId: string,
  marketplaceItemId: number,
): Promise<number | null> {
  const [existing] = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(and(
      eq(botsTable.ownerId, ownerId),
      eq(botsTable.marketplaceItemId, marketplaceItemId),
    ))
    .orderBy(botsTable.id)
    .limit(1);
  return existing?.id ?? null;
}
