import { db, organizationsTable, orgMembersTable, botsTable, botMarketplaceTable, botSubscriptionsTable } from "@workspace/db";
import { and, eq, sql, inArray, isNull } from "drizzle-orm";

export interface ActivateResult {
  created: number;
  skipped: number;
  targets: number;
}

export async function activateAllBotsForUser(userId: string): Promise<ActivateResult> {
  const items = await db.select().from(botMarketplaceTable)
    .where(eq(botMarketplaceTable.active, true));
  if (items.length === 0) return { created: 0, skipped: 0, targets: 1 };

  const existingSubs = await db.select().from(botSubscriptionsTable)
    .where(eq(botSubscriptionsTable.userId, userId));
  const existingByItemId = new Map(existingSubs.map(s => [s.marketplaceItemId, s]));

  let created = 0;
  let skipped = 0;
  for (const item of items) {
    const existing = existingByItemId.get(item.id);
    if (existing && existing.botId && existing.status === "active") { skipped++; continue; }
    try {
      await db.transaction(async (tx) => {
        // Reuse an existing bot instance for this template if one is already
        // present (e.g. the subscription row was wiped/orphaned but the bot
        // survived) so we never stamp a fresh duplicate. Otherwise insert one.
        const [present] = await tx.select({ id: botsTable.id })
          .from(botsTable)
          .where(and(
            eq(botsTable.ownerId, userId),
            eq(botsTable.marketplaceItemId, item.id),
          ))
          .orderBy(botsTable.id)
          .limit(1);

        const bot = present
          ? present
          : (await tx.insert(botsTable).values({
              ownerId: userId,
              name: item.name,
              personality: item.personality,
              systemPrompt: item.systemPrompt,
              permissions: item.permissions,
              marketplaceItemId: item.id,
              status: "active",
            }).returning())[0];

        if (existing) {
          await tx.update(botSubscriptionsTable)
            .set({ botId: bot.id, status: "active" })
            .where(and(
              eq(botSubscriptionsTable.userId, userId),
              eq(botSubscriptionsTable.marketplaceItemId, item.id),
            ));
        } else {
          // Use upsert to tolerate concurrent activations on the (userId, marketplaceItemId) PK.
          await tx.insert(botSubscriptionsTable).values({
            userId,
            marketplaceItemId: item.id,
            botId: bot.id,
            status: "active",
          }).onConflictDoUpdate({
            target: [botSubscriptionsTable.userId, botSubscriptionsTable.marketplaceItemId],
            set: { botId: bot.id, status: "active" },
          });
        }
      });
      created++;
    } catch (err) {
      console.error(`[Picasso Bots] Failed to activate ${item.slug} for ${userId}:`, err);
    }
  }
  return { created, skipped, targets: 1 };
}

export async function activateAllBotsForPicassoOrg(): Promise<void> {
  const [picasso] = await db.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = 'picasso'`);
  if (!picasso) {
    console.log("[Picasso Bots] Picasso org not found yet — skipping bot activation.");
    return;
  }

  const members = await db.select({ userId: orgMembersTable.userId, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, picasso.id),
      eq(orgMembersTable.status, "active"),
      sql`${orgMembersTable.userId} <> 'system'`,
    ));

  const targets = members.filter(m => m.role === 'owner' || m.role === 'ceo');
  if (targets.length === 0) {
    console.log("[Picasso Bots] No human owner/ceo members yet — skipping.");
    return;
  }

  const items = await db.select().from(botMarketplaceTable)
    .where(eq(botMarketplaceTable.active, true));
  if (items.length === 0) {
    console.log("[Picasso Bots] No marketplace items found.");
    return;
  }

  // Backfill orgId on existing Picasso-member bots and subscriptions.
  const memberIds = targets.map(m => m.userId);
  if (memberIds.length > 0) {
    const itemIds = items.map(i => i.id);
    const backfilledBots = await db.update(botsTable)
      .set({ orgId: picasso.id })
      .where(and(
        inArray(botsTable.ownerId, memberIds),
        inArray(botsTable.marketplaceItemId, itemIds),
        isNull(botsTable.orgId),
      ))
      .returning({ id: botsTable.id });
    const backfilledSubs = await db.update(botSubscriptionsTable)
      .set({ orgId: picasso.id })
      .where(and(
        inArray(botSubscriptionsTable.userId, memberIds),
        inArray(botSubscriptionsTable.marketplaceItemId, itemIds),
        isNull(botSubscriptionsTable.orgId),
      ))
      .returning({ userId: botSubscriptionsTable.userId });
    if (backfilledBots.length > 0 || backfilledSubs.length > 0) {
      console.log(`[Picasso Bots] Backfilled orgId on ${backfilledBots.length} bot(s) and ${backfilledSubs.length} subscription(s).`);
    }
  }

  // Prime access makes these agents available in the factory; it does not
  // activate them. Activation is explicit and reserves one real workstation.
  console.log(`[Picasso Bots] Reconciled ownership metadata for ${targets.length} member(s); no bots auto-activated.`);
}
