import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  botsTable,
  botMarketplaceTable,
  botSubscriptionsTable,
  botPlatformConnectionsTable,
} from "@workspace/db";
import { dedupeDuplicateBots, pickCanonicalBotId } from "../lib/dedupe-bots";

describe("pickCanonicalBotId", () => {
  it("prefers the subscription-linked instance when it is in the group", () => {
    expect(pickCanonicalBotId([10, 11, 12], 12)).toBe(12);
  });

  it("falls back to the oldest (first) instance when the subscription is null", () => {
    expect(pickCanonicalBotId([10, 11, 12], null)).toBe(10);
  });

  it("falls back to the oldest when the subscription points outside the group", () => {
    expect(pickCanonicalBotId([10, 11, 12], 999)).toBe(10);
  });
});

describe("dedupeDuplicateBots — collapse duplicate instances", () => {
  const OWNER_ID = `dedupe-${randomUUID()}`;
  const OWNER_EMAIL = `dedupe-${randomUUID().slice(0, 8)}@test`;
  let itemId: number;
  let canonicalId: number;
  let duplicateIds: number[] = [];

  beforeAll(async () => {
    await db.insert(usersTable).values({ id: OWNER_ID, email: OWNER_EMAIL });
    const [item] = await db
      .insert(botMarketplaceTable)
      .values({
        slug: `dedupe-item-${randomUUID().slice(0, 8)}`,
        name: "Dedupe Template",
        tagline: "t",
        description: "d",
        personality: "p",
        systemPrompt: "s",
      })
      .returning({ id: botMarketplaceTable.id });
    itemId = item.id;

    // Insert 1 canonical + 5 duplicate bot instances, all on the same template.
    const inserted = await db
      .insert(botsTable)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          ownerId: OWNER_ID,
          name: `Copy ${i} Prime`,
          marketplaceItemId: itemId,
          status: "active" as const,
        })),
      )
      .returning({ id: botsTable.id });
    const ids = inserted.map(b => b.id).sort((a, b) => a - b);

    // Point the subscription at a NON-oldest instance so we prove the
    // subscription-linked row wins over "oldest".
    canonicalId = ids[3];
    duplicateIds = ids.filter(id => id !== canonicalId);

    await db.insert(botSubscriptionsTable).values({
      userId: OWNER_ID,
      marketplaceItemId: itemId,
      botId: canonicalId,
      status: "active",
    });

    // A platform connection on a doomed duplicate must be re-pointed, not lost.
    await db.insert(botPlatformConnectionsTable).values({
      botId: duplicateIds[0],
      platform: "telegram",
      credentials: "",
    });
  });

  afterAll(async () => {
    await db.delete(botPlatformConnectionsTable).where(inArray(botPlatformConnectionsTable.botId, [canonicalId, ...duplicateIds]));
    await db.delete(botSubscriptionsTable).where(eq(botSubscriptionsTable.userId, OWNER_ID));
    await db.delete(botsTable).where(eq(botsTable.ownerId, OWNER_ID));
    await db.delete(botMarketplaceTable).where(eq(botMarketplaceTable.id, itemId));
    await db.delete(usersTable).where(eq(usersTable.id, OWNER_ID));
  });

  it("keeps exactly one canonical instance and re-points references", async () => {
    await dedupeDuplicateBots();

    const remaining = await db
      .select({ id: botsTable.id })
      .from(botsTable)
      .where(and(eq(botsTable.ownerId, OWNER_ID), eq(botsTable.marketplaceItemId, itemId)));
    expect(remaining.map(r => r.id)).toEqual([canonicalId]);

    const [sub] = await db
      .select({ botId: botSubscriptionsTable.botId })
      .from(botSubscriptionsTable)
      .where(and(
        eq(botSubscriptionsTable.userId, OWNER_ID),
        eq(botSubscriptionsTable.marketplaceItemId, itemId),
      ));
    expect(sub.botId).toBe(canonicalId);

    // Platform connection survived and now points at the canonical instance.
    const conns = await db
      .select({ botId: botPlatformConnectionsTable.botId })
      .from(botPlatformConnectionsTable)
      .where(eq(botPlatformConnectionsTable.botId, canonicalId));
    expect(conns.length).toBe(1);
  });

  it("is a no-op on a second run (idempotent)", async () => {
    const result = await dedupeDuplicateBots();
    // Our group is already collapsed; it must not be collapsed again.
    const remaining = await db
      .select({ id: botsTable.id })
      .from(botsTable)
      .where(and(eq(botsTable.ownerId, OWNER_ID), eq(botsTable.marketplaceItemId, itemId)));
    expect(remaining.map(r => r.id)).toEqual([canonicalId]);
    expect(result.groupsCollapsed).toBeGreaterThanOrEqual(0);
  });
});
