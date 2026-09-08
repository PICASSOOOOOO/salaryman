import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  legacyRecoveryEventsTable,
  legacyRecoverySnapshotsTable,
  playerInventoryTable,
  pledgePurchasesTable,
  salarymanSavesTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  captureLegacyRecoverySnapshots,
  normalizeRecoveryEmail,
  recordLegacyRecoveryEvent,
  restoreLegacyRecoveryForUser,
} from "../lib/legacy-recovery";

describe("durable reset recovery", () => {
  const userId = `legacy-recovery-test-${randomUUID()}`;
  const email = `Legacy.Player.${randomUUID()}@Example.Test`;
  const normalizedEmail = email.trim().toLowerCase();

  beforeAll(async () => {
    await db.insert(usersTable).values({ id: userId, email });
    await db.insert(bankAccountsTable).values({
      userId,
      kind: "cash",
      label: "CASH WALLET",
      balance: 12_345,
      currency: "FIAT",
      apyBps: 0,
    });
    await db.insert(playerInventoryTable).values({
      userId,
      slotIndex: 0,
      itemId: "legacy_test_food",
      quantity: 2,
      acquiredVia: "fiat",
    });
    await db.insert(pledgePurchasesTable).values({
      userId,
      itemId: "legacy_test_pledge",
      category: "technology",
      name: "Legacy Test Pledge",
      amountCents: 4900,
      status: "completed",
      grantedBy: "stripe",
    });
    await db.insert(salarymanSavesTable).values({
      userId,
      slotIndex: 0,
      charName: "Legacy Test",
      charClass: "OPERATOR",
      data: { propertyDeeds: [{ id: "legacy-office", currentValue: 90_000 }] },
    });
  });

  afterAll(async () => {
    await db.delete(legacyRecoveryEventsTable).where(eq(legacyRecoveryEventsTable.emailKey, normalizedEmail));
    await db.delete(legacyRecoverySnapshotsTable).where(eq(legacyRecoverySnapshotsTable.emailKey, normalizedEmail));
    await db.delete(bankTransactionsTable).where(eq(bankTransactionsTable.userId, userId));
    await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
    await db.delete(playerInventoryTable).where(eq(playerInventoryTable.userId, userId));
    await db.delete(pledgePurchasesTable).where(eq(pledgePurchasesTable.userId, userId));
    await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it("normalizes email keys and captures existing player state", async () => {
    expect(normalizeRecoveryEmail(`  ${email} `)).toBe(normalizedEmail);
    const captured = await db.transaction((tx) =>
      captureLegacyRecoverySnapshots(tx, `test:${randomUUID()}`, [userId]));
    expect(captured).toBe(1);
  });

  it("restores ownership idempotently after the wiped rows are gone", async () => {
    await db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, userId));
    await db.delete(playerInventoryTable).where(eq(playerInventoryTable.userId, userId));
    await db.delete(pledgePurchasesTable).where(eq(pledgePurchasesTable.userId, userId));
    await db.delete(salarymanSavesTable).where(eq(salarymanSavesTable.userId, userId));

    await recordLegacyRecoveryEvent({
      userId,
      eventKey: `test-vending:${randomUUID()}`,
      kind: "tower_vending_item",
      itemId: "legacy_test_food",
      slotIndex: 0,
      quantity: 3,
      amountFiat: 300,
    });

    const first = await restoreLegacyRecoveryForUser(userId, ` ${email.toLowerCase()} `);
    expect(first.restored).toBe(true);
    const [inventory] = await db.select().from(playerInventoryTable)
      .where(and(
        eq(playerInventoryTable.userId, userId),
        eq(playerInventoryTable.itemId, "legacy_test_food"),
      ));
    expect(inventory?.quantity).toBe(5);
    expect((await db.select().from(pledgePurchasesTable)
      .where(and(eq(pledgePurchasesTable.userId, userId), eq(pledgePurchasesTable.itemId, "legacy_test_pledge"))))).toHaveLength(1);

    await db.insert(salarymanSavesTable).values({
      userId,
      slotIndex: 0,
      charName: "Recovered",
      charClass: "OPERATOR",
      data: {},
    });
    await restoreLegacyRecoveryForUser(userId, email);
    const second = await restoreLegacyRecoveryForUser(userId, email);
    expect(second.restored).toBe(false);
    const [save] = await db.select({ data: salarymanSavesTable.data })
      .from(salarymanSavesTable)
      .where(and(eq(salarymanSavesTable.userId, userId), eq(salarymanSavesTable.slotIndex, 0)));
    expect(Array.isArray((save?.data as Record<string, unknown>)?.propertyDeeds)).toBe(true);
    expect((await db.select().from(playerInventoryTable)
      .where(and(eq(playerInventoryTable.userId, userId), eq(playerInventoryTable.itemId, "legacy_test_food"))))).toHaveLength(1);
  });
});