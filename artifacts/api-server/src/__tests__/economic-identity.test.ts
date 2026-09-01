import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  organizationsTable,
  playerProfilesTable,
  usersTable,
  normalizeOrgName,
} from "@workspace/db";

const userIds: string[] = [];
const orgIds: number[] = [];

afterAll(async () => {
  if (orgIds.length) await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds));
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
});

describe("economic identity invariants", () => {
  it("normalizes invisible and repeated spacing in organization names", () => {
    expect(normalizeOrgName("  Acme\u200B   Holdings  ")).toBe("Acme Holdings");
    expect(normalizeOrgName("ＡＣＭＥ")).toBe("ACME");
  });

  it("assigns one economic identity per account regardless of profile count", async () => {
    const [user] = await db.insert(usersTable).values({
      email: `identity-${crypto.randomUUID()}@example.test`,
    }).returning({ id: usersTable.id, economicId: usersTable.economicId });
    userIds.push(user.id);

    await db.insert(playerProfilesTable).values([
      { userId: user.id, playerName: `ID ${crypto.randomUUID().slice(0, 8)}`.toUpperCase() },
      { userId: user.id, playerName: `ID ${crypto.randomUUID().slice(0, 8)}`.toUpperCase() },
    ]);

    const [reloaded] = await db.select({ economicId: usersTable.economicId })
      .from(usersTable).where(eq(usersTable.id, user.id));
    const profiles = await db.select().from(playerProfilesTable).where(eq(playerProfilesTable.userId, user.id));

    expect(reloaded.economicId).toBe(user.economicId);
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles.map((profile) => profile.userId))).toEqual(new Set([user.id]));
  });

  it("enforces canonical business-name uniqueness and unique business IDs", async () => {
    const ownerUserId = `identity-owner-${crypto.randomUUID()}`;
    const suffix = crypto.randomUUID().slice(0, 8);
    const [first] = await db.insert(organizationsTable).values({
      name: `IDENTITY   HOLDINGS ${suffix}`,
      ownerUserId,
    }).returning();
    orgIds.push(first.id);

    const [second] = await db.insert(organizationsTable).values({
      name: `SECOND BUSINESS ${suffix}`,
      ownerUserId,
    }).returning();
    orgIds.push(second.id);
    expect(first.businessId).not.toBe(second.businessId);

    await expect(db.insert(organizationsTable).values({
      name: `identity holdings ${suffix}`,
      ownerUserId,
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof Error && (error as Error & { cause?: { code?: string } }).cause?.code === "23505");
  });
});