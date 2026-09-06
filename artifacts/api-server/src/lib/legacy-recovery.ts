import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  bankAccountsTable,
  bankTransactionsTable,
  db,
  legacyRecoveryEventsTable,
  legacyRecoverySnapshotsTable,
  playerGoldAccountsTable,
  playerInventoryTable,
  pledgePurchasesTable,
  salarymanSavesTable,
  usersTable,
  type LegacyRecoveryGold,
  type LegacyRecoveryInventory,
  type LegacyRecoveryPledge,
  type LegacyRecoveryProperty,
} from "@workspace/db";
import { ensureFiatAccounts } from "./fiat-wallet";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeRecoveryEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized && normalized.includes("@") ? normalized : null;
}

function asProperties(data: unknown, slotIndex: number): LegacyRecoveryProperty[number] | null {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return Array.isArray(record.propertyDeeds)
    ? { slotIndex, propertyDeeds: record.propertyDeeds }
    : null;
}

export async function captureLegacyRecoverySnapshot(
  tx: Tx,
  batchId: string,
  userId: string,
): Promise<boolean> {
  const [user] = await tx
    .select({ id: usersTable.id, email: usersTable.email, economicId: usersTable.economicId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const emailKey = normalizeRecoveryEmail(user?.email);
  if (!user || !emailKey) return false;

  const [fiat] = await tx
    .select({ total: sql<number>`coalesce(sum(${bankAccountsTable.balance}), 0)::int` })
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.currency, "FIAT")));
  const goldRows = await tx
    .select({ slotIndex: playerGoldAccountsTable.slotIndex, balanceTenths: playerGoldAccountsTable.balanceTenths })
    .from(playerGoldAccountsTable)
    .where(eq(playerGoldAccountsTable.userId, userId));
  const inventoryRows = await tx
    .select({
      slotIndex: playerInventoryTable.slotIndex,
      itemId: playerInventoryTable.itemId,
      quantity: playerInventoryTable.quantity,
      acquiredVia: playerInventoryTable.acquiredVia,
    })
    .from(playerInventoryTable)
    .where(eq(playerInventoryTable.userId, userId));
  const pledgeRows = await tx
    .select({
      itemId: pledgePurchasesTable.itemId,
      category: pledgePurchasesTable.category,
      name: pledgePurchasesTable.name,
      amountCents: pledgePurchasesTable.amountCents,
      stripeSessionId: pledgePurchasesTable.stripeSessionId,
      grantedBy: pledgePurchasesTable.grantedBy,
    })
    .from(pledgePurchasesTable)
    .where(and(eq(pledgePurchasesTable.userId, userId), eq(pledgePurchasesTable.status, "completed")));
  const saveRows = await tx
    .select({ slotIndex: salarymanSavesTable.slotIndex, data: salarymanSavesTable.data })
    .from(salarymanSavesTable)
    .where(eq(salarymanSavesTable.userId, userId));

  const gold: LegacyRecoveryGold = goldRows.map((row) => ({
    slotIndex: row.slotIndex,
    balanceTenths: Math.max(0, row.balanceTenths),
  }));
  const inventory: LegacyRecoveryInventory = inventoryRows
    .filter((row) => row.quantity > 0)
    .map((row) => ({ ...row, quantity: Math.max(0, row.quantity) }));
  const pledges: LegacyRecoveryPledge = pledgeRows.map((row) => ({ ...row }));
  const properties: LegacyRecoveryProperty = saveRows
    .map((row) => asProperties(row.data, row.slotIndex))
    .filter((row): row is LegacyRecoveryProperty[number] => row !== null);

  await tx
    .insert(legacyRecoverySnapshotsTable)
    .values({
      batchId,
      emailKey,
      sourceUserId: user.id,
      sourceEconomicId: user.economicId,
      fiatBalance: Math.max(0, fiat?.total ?? 0),
      gold,
      inventory,
      pledges,
      properties,
    })
    .onConflictDoNothing();
  return true;
}

export async function captureLegacyRecoverySnapshots(
  tx: Tx,
  batchId: string,
  userIds?: string[],
): Promise<number> {
  const users = userIds
    ? userIds.map((userId) => ({ id: userId }))
    : await tx.select({ id: usersTable.id }).from(usersTable);
  let captured = 0;
  for (const user of users) {
    if (await captureLegacyRecoverySnapshot(tx, batchId, user.id)) captured++;
  }
  return captured;
}

export type LegacyRecoveryEventInput = {
  userId: string;
  eventKey: string;
  kind: "pledge_entitlement" | "tower_vending_item" | "vending_food";
  itemId?: string;
  slotIndex?: number;
  quantity?: number;
  amountFiat?: number;
  payload?: Record<string, unknown>;
};

export async function recordLegacyRecoveryEventTx(tx: Tx, args: LegacyRecoveryEventInput): Promise<boolean> {
  const [user] = await tx
    .select({ id: usersTable.id, email: usersTable.email, economicId: usersTable.economicId })
    .from(usersTable)
    .where(eq(usersTable.id, args.userId))
    .limit(1);
  const emailKey = normalizeRecoveryEmail(user?.email);
  if (!user || !emailKey) return false;
  await tx.insert(legacyRecoveryEventsTable).values({
    eventKey: args.eventKey,
    emailKey,
    sourceUserId: user.id,
    sourceEconomicId: user.economicId,
    kind: args.kind,
    itemId: args.itemId,
    slotIndex: args.slotIndex,
    quantity: Math.max(1, Math.floor(args.quantity ?? 1)),
    amountFiat: Math.max(0, Math.floor(args.amountFiat ?? 0)),
    payload: args.payload,
  }).onConflictDoNothing();
  return true;
}

export async function recordLegacyRecoveryEvent(args: LegacyRecoveryEventInput): Promise<boolean> {
  return db.transaction((tx) => recordLegacyRecoveryEventTx(tx, args));
}

type RestoreResult = {
  restored: boolean;
  fiatAdded: number;
  inventoryItems: number;
  pledgeItems: number;
  properties: LegacyRecoveryProperty;
};

export async function restoreLegacyRecoveryForUser(
  userId: string,
  email: string | null | undefined,
): Promise<RestoreResult> {
  const empty: RestoreResult = { restored: false, fiatAdded: 0, inventoryItems: 0, pledgeItems: 0, properties: [] };
  const emailKey = normalizeRecoveryEmail(email);
  if (!emailKey) return empty;

  return db.transaction(async (tx): Promise<RestoreResult> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${emailKey}), 42007)`);
    const [currentUser] = await tx
      .select({ id: usersTable.id, email: usersTable.email, economicId: usersTable.economicId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!currentUser || normalizeRecoveryEmail(currentUser.email) !== emailKey) return empty;

    const sameEmailUsers = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(trim(${usersTable.email})) = ${emailKey}`);
    const identitySafe = (sourceUserId: string, sourceEconomicId: string | null) =>
      sourceUserId === userId
      || (!!sourceEconomicId && sourceEconomicId === currentUser.economicId)
      || (sameEmailUsers.length === 1 && sameEmailUsers[0].id === userId);

    const snapshots = (await tx
      .select()
      .from(legacyRecoverySnapshotsTable)
      .where(and(eq(legacyRecoverySnapshotsTable.emailKey, emailKey), sql`${legacyRecoverySnapshotsTable.restoredAt} IS NULL`))
      .orderBy(asc(legacyRecoverySnapshotsTable.createdAt)))
      .filter((row) => identitySafe(row.sourceUserId, row.sourceEconomicId));
    const events = (await tx
      .select()
      .from(legacyRecoveryEventsTable)
      .where(and(eq(legacyRecoveryEventsTable.emailKey, emailKey), sql`${legacyRecoveryEventsTable.restoredAt} IS NULL`))
      .orderBy(asc(legacyRecoveryEventsTable.createdAt)))
      .filter((row) => identitySafe(row.sourceUserId, row.sourceEconomicId));
    if (snapshots.length === 0 && events.length === 0) return empty;

    const accounts = await ensureFiatAccounts(tx, userId);
    const currentFiat = accounts.reduce((sum, account) => sum + (account.currency === "FIAT" ? account.balance : 0), 0);
    const protectedFiat = snapshots.reduce((max, row) => Math.max(max, row.fiatBalance), 0);
    const fiatAdded = Math.max(0, protectedFiat - currentFiat);
    if (fiatAdded > 0) {
      const target = accounts.find((account) => account.kind === "cash") ?? accounts[0];
      if (target) {
        const balanceAfter = target.balance + fiatAdded;
        await tx.update(bankAccountsTable)
          .set({ balance: balanceAfter, updatedAt: new Date() })
          .where(eq(bankAccountsTable.id, target.id));
        await tx.insert(bankTransactionsTable).values({
          userId,
          accountId: target.id,
          kind: "legacy_recovery",
          description: "Protected player balance restored after reset",
          amount: fiatAdded,
          balanceAfter,
        });
      }
    }

    const inventoryByKey = new Map<string, LegacyRecoveryInventory[number]>();
    for (const row of snapshots.flatMap((snapshot) => snapshot.inventory)) {
      const key = `${row.slotIndex}:${row.itemId}`;
      const prior = inventoryByKey.get(key);
      if (!prior || row.quantity > prior.quantity) inventoryByKey.set(key, row);
    }
    const newestSnapshotAt = snapshots.reduce<Date | null>(
      (latest, snapshot) => (!latest || snapshot.createdAt > latest ? snapshot.createdAt : latest),
      null,
    );
    for (const event of events.filter((row) =>
      row.kind === "tower_vending_item"
      && row.itemId
      && (!newestSnapshotAt || row.createdAt > newestSnapshotAt)
    )) {
      const key = `${event.slotIndex ?? 0}:${event.itemId}`;
      const prior = inventoryByKey.get(key);
      const quantity = (prior?.quantity ?? 0) + event.quantity;
      inventoryByKey.set(key, {
        slotIndex: event.slotIndex ?? 0,
        itemId: event.itemId!,
        quantity,
        acquiredVia: "legacy",
      });
    }
    for (const item of inventoryByKey.values()) {
      await tx.insert(playerInventoryTable)
        .values({ userId, ...item, acquiredVia: item.acquiredVia.slice(0, 16) })
        .onConflictDoUpdate({
          target: [playerInventoryTable.userId, playerInventoryTable.slotIndex, playerInventoryTable.itemId],
          set: { quantity: sql`greatest(${playerInventoryTable.quantity}, ${item.quantity})` },
        });
    }

    const pledgeCandidates = [
      ...snapshots.flatMap((snapshot) => snapshot.pledges),
      ...events
        .filter((event) => event.kind === "pledge_entitlement" && event.itemId)
        .map((event) => ({
          itemId: event.itemId!,
          category: String(event.payload?.category ?? "technology"),
          name: String(event.payload?.name ?? event.itemId),
          amountCents: Number(event.payload?.amountCents ?? 0),
          stripeSessionId: event.payload?.stripeSessionId ? String(event.payload.stripeSessionId) : null,
          grantedBy: "legacy_restore",
        })),
    ];
    let pledgeItems = 0;
    for (const pledge of pledgeCandidates) {
      const [existing] = await tx.select({ id: pledgePurchasesTable.id })
        .from(pledgePurchasesTable)
        .where(and(
          eq(pledgePurchasesTable.userId, userId),
          eq(pledgePurchasesTable.itemId, pledge.itemId),
          eq(pledgePurchasesTable.status, "completed"),
        ))
        .limit(1);
      if (existing) continue;
      await tx.insert(pledgePurchasesTable).values({
        userId,
        itemId: pledge.itemId,
        category: pledge.category,
        name: pledge.name,
        amountCents: Math.max(0, pledge.amountCents),
        stripeSessionId: pledge.stripeSessionId,
        status: "completed",
        grantedBy: pledge.grantedBy || "legacy_restore",
      });
      pledgeItems++;
    }

    const properties = snapshots.flatMap((snapshot) => snapshot.properties);
    const resolvedSnapshotIds: number[] = [];
    for (const snapshot of snapshots) {
      let resolved = true;
      for (const property of snapshot.properties) {
        const [save] = await tx
          .select({ id: salarymanSavesTable.id, data: salarymanSavesTable.data })
          .from(salarymanSavesTable)
          .where(and(
            eq(salarymanSavesTable.userId, userId),
            eq(salarymanSavesTable.slotIndex, property.slotIndex),
          ))
          .for("update")
          .limit(1);
        if (!save) {
          resolved = false;
          continue;
        }
        const data = save.data as Record<string, unknown>;
        if (!Array.isArray(data.propertyDeeds)) {
          await tx.update(salarymanSavesTable)
            .set({ data: { ...data, propertyDeeds: property.propertyDeeds }, lastSavedAt: new Date() })
            .where(eq(salarymanSavesTable.id, save.id));
        }
      }
      if (resolved) resolvedSnapshotIds.push(snapshot.id);
    }
    const eventIds = events.map((event) => event.id);
    if (resolvedSnapshotIds.length > 0) {
      await tx.update(legacyRecoverySnapshotsTable)
        .set({ restoredAt: new Date() })
        .where(inArray(legacyRecoverySnapshotsTable.id, resolvedSnapshotIds));
    }
    if (eventIds.length > 0) {
      await tx.update(legacyRecoveryEventsTable)
        .set({ restoredAt: new Date() })
        .where(inArray(legacyRecoveryEventsTable.id, eventIds));
    }
    return {
      restored: true,
      fiatAdded,
      inventoryItems: inventoryByKey.size,
      pledgeItems,
      properties,
    };
  });
}