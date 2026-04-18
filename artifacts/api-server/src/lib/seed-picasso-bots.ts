import { db, organizationsTable, orgMembersTable, botsTable, botMarketplaceTable, botSubscriptionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

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
        const [bot] = await tx.insert(botsTable).values({
          ownerId: userId,
          name: item.name,
          personality: item.personality,
          systemPrompt: item.systemPrompt,
          permissions: item.permissions,
          marketplaceItemId: item.id,
          status: "active",
        }).returning();

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

  let createdTotal = 0;
  let skippedTotal = 0;

  for (const member of targets) {
    const existingSubs = await db.select().from(botSubscriptionsTable)
      .where(eq(botSubscriptionsTable.userId, member.userId));
    const existingByItemId = new Map(existingSubs.map(s => [s.marketplaceItemId, s]));

    for (const item of items) {
      const existing = existingByItemId.get(item.id);
      if (existing && existing.botId && existing.status === "active") {
        skippedTotal++;
        continue;
      }
      try {
        const [bot] = await db.insert(botsTable).values({
          ownerId: member.userId,
          name: item.name,
          personality: item.personality,
          systemPrompt: item.systemPrompt,
          permissions: item.permissions,
          marketplaceItemId: item.id,
          status: "active",
        }).returning();

        if (existing) {
          await db.update(botSubscriptionsTable)
            .set({ botId: bot.id, status: "active" })
            .where(and(
              eq(botSubscriptionsTable.userId, member.userId),
              eq(botSubscriptionsTable.marketplaceItemId, item.id),
            ));
        } else {
          await db.insert(botSubscriptionsTable).values({
            userId: member.userId,
            marketplaceItemId: item.id,
            botId: bot.id,
            status: "active",
          });
        }
        createdTotal++;
      } catch (err) {
        console.error(`[Picasso Bots] Failed to activate ${item.slug} for ${member.userId}:`, err);
      }
    }
  }

  console.log(`[Picasso Bots] Activated ${createdTotal} bot(s), skipped ${skippedTotal} already active. Targets: ${targets.length} member(s).`);
}
