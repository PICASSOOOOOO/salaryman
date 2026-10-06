import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  bankAccountsTable,
  db,
  desktopBuildingObjectStatesTable,
  desktopOfficePresenceTable,
  orgAccountTransactionsTable,
  orgAccountsTable,
  organizationsTable,
  playerLedgerTable,
} from "@workspace/db";
import { creditFiat } from "./fiat-wallet";
import { publicMaintenanceSlotLimit } from "./maintenance-policy";

const PICASSO_ORG_NAME = "picasso";
const PABLO_PUBLIC_WORKS_ORG_NAME = "PABLO CORP · TOWER PUBLIC WORKS";
const DEMAND_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const DEMAND_CACHE_MS = 15_000;
const FUNDING_LOCK_KEY = 731_904_217;

export type PublicWorkDemand = {
  recentResidents: number;
  recentWorkerResidents: number;
  averageFiatWealth: number;
  maxConcurrentJobs: number;
  rewardPoolBalanceFiat: number;
};

type Transaction = Parameters<typeof creditFiat>[0];

const cachedDemand = new Map<string, { expiresAt: number; value: PublicWorkDemand }>();

export async function getPublicWorkDemand(city: string): Promise<PublicWorkDemand> {
  const nowMs = Date.now();
  const cached = cachedDemand.get(city);
  if (cached && cached.expiresAt > nowMs) return cached.value;

  const cutoff = new Date(nowMs - DEMAND_WINDOW_MS);
  const recentPresence = await db.select({ userId: desktopOfficePresenceTable.userId })
    .from(desktopOfficePresenceTable)
    .where(and(
      eq(desktopOfficePresenceTable.city, city),
      gte(desktopOfficePresenceTable.lastSeenAt, cutoff),
      lte(desktopOfficePresenceTable.floorNumber, 4),
      inArray(desktopOfficePresenceTable.room, ["lobby", "hallway"]),
    ));
  const residentIds = [...new Set(recentPresence.map((row) => row.userId))];
  const residents = new Set(residentIds);

  let recentWorkerResidents = 0;
  let averageFiatWealth = 0;
  let rewardPoolBalanceFiat = 0;
  const [picasso] = await db.select({ id: organizationsTable.id }).from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = ${PICASSO_ORG_NAME}`)
    .limit(1);
  if (picasso) {
    const [pool] = await db.select({ balanceFiat: orgAccountsTable.balanceFiat }).from(orgAccountsTable)
      .where(and(
        eq(orgAccountsTable.orgId, picasso.id),
        eq(orgAccountsTable.type, "checking"),
      ))
      .limit(1);
    rewardPoolBalanceFiat = Math.max(0, pool?.balanceFiat ?? 0);
  }
  if (residentIds.length > 0) {
    const completedWork = await db.select({
      userId: desktopBuildingObjectStatesTable.workCompletedByUserId,
    }).from(desktopBuildingObjectStatesTable)
      .where(and(
        gte(desktopBuildingObjectStatesTable.workCompletedAt, cutoff),
        eq(desktopBuildingObjectStatesTable.city, city),
        lte(desktopBuildingObjectStatesTable.floorNumber, 4),
        inArray(desktopBuildingObjectStatesTable.room, ["lobby", "hallway"]),
        isNotNull(desktopBuildingObjectStatesTable.workCompletedByUserId),
      ));
    recentWorkerResidents = new Set(
      completedWork
        .map((row) => row.userId)
        .filter((userId): userId is string => Boolean(userId && residents.has(userId))),
    ).size;

    const accounts = await db.select({
      userId: bankAccountsTable.userId,
      kind: bankAccountsTable.kind,
      balance: bankAccountsTable.balance,
    }).from(bankAccountsTable)
      .where(and(inArray(bankAccountsTable.userId, residentIds), eq(bankAccountsTable.currency, "FIAT")));
    const quarantines = await db.select({
      userId: playerLedgerTable.userId,
      quarantineFiat: playerLedgerTable.quarantineFiat,
    }).from(playerLedgerTable)
      .where(inArray(playerLedgerTable.userId, residentIds));
    const quarantineByUser = new Map(quarantines.map((row) => [row.userId, row.quarantineFiat]));
    const balances = new Map<string, { cash: number; all: number; hasCash: boolean }>();
    for (const account of accounts) {
      const current = balances.get(account.userId) ?? { cash: 0, all: 0, hasCash: false };
      current.all += account.balance;
      if (account.kind === "cash") {
        current.cash += account.balance;
        current.hasCash = true;
      }
      balances.set(account.userId, current);
    }
    const totalSpendable = residentIds.reduce((sum, userId) => {
      const balance = balances.get(userId);
      const available = balance
        ? (balance.hasCash ? balance.cash : balance.all)
        : 0;
      return sum + Math.max(0, available - (quarantineByUser.get(userId) ?? 0));
    }, 0);
    averageFiatWealth = totalSpendable / residentIds.length;
  }

  const value: PublicWorkDemand = {
    recentResidents: residentIds.length,
    recentWorkerResidents,
    averageFiatWealth,
    rewardPoolBalanceFiat,
    maxConcurrentJobs: publicMaintenanceSlotLimit({
      recentResidents: residentIds.length,
      recentWorkerResidents,
      averageFiatWealth,
    }),
  };
  cachedDemand.set(city, { expiresAt: nowMs + DEMAND_CACHE_MS, value });
  return value;
}

export async function payPublicMaintenanceReward(
  tx: Transaction,
  input: { userId: string; amountFiat: number; sessionId: string; action: string; floorNumber: number },
): Promise<{ balance: number; spendable: number } | null> {
  if (!Number.isInteger(input.amountFiat) || input.amountFiat <= 0 || input.amountFiat > 100) {
    throw new Error("Public Tower maintenance payout must be between 1 and 100 FIAT");
  }

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${FUNDING_LOCK_KEY})`);
  const [picasso] = await tx.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = ${PICASSO_ORG_NAME}`)
    .for("update").limit(1);
  if (!picasso) return null;
  const [pool] = await tx.select().from(orgAccountsTable)
    .where(and(
      eq(orgAccountsTable.orgId, picasso.id),
      eq(orgAccountsTable.type, "checking"),
    ))
    .for("update").limit(1);
  if (!pool || pool.balanceFiat < input.amountFiat) return null;
  const now = new Date();
  const [poolDebited] = await tx.update(orgAccountsTable)
    .set({
      balanceFiat: sql`${orgAccountsTable.balanceFiat} - ${input.amountFiat}`,
      updatedAt: now,
    })
    .where(and(
      eq(orgAccountsTable.id, pool.id),
      gte(orgAccountsTable.balanceFiat, input.amountFiat),
    ))
    .returning({ balanceFiat: orgAccountsTable.balanceFiat });
  if (!poolDebited) return null;
  await tx.insert(orgAccountTransactionsTable).values({
    orgId: picasso.id,
    accountType: "checking",
    delta: -input.amountFiat,
    balanceAfter: poolDebited.balanceFiat,
    description: `Receptionist Mila paid public Tower ${input.action} work · session ${input.sessionId}`,
    category: "game_reward_pool",
    actorUserId: input.userId,
  });

  const credit = await creditFiat(tx, {
    userId: input.userId,
    amountFiat: input.amountFiat,
    description: `Receptionist Mila · public Tower ${input.action} · Floor ${input.floorNumber}`,
    kind: "tower_public_work",
    idempotencyKey: `pablo-public-work:${input.sessionId}`,
  });
  return { balance: credit.newBalance, spendable: credit.spendable };
}

export async function hasPublicMaintenanceFunds(
  tx: Transaction,
  amountFiat: number,
): Promise<boolean> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${FUNDING_LOCK_KEY})`);
  const [picasso] = await tx.select({ id: organizationsTable.id }).from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = ${PICASSO_ORG_NAME}`)
    .for("update").limit(1);
  if (!picasso) return false;
  const [pool] = await tx.select({ balanceFiat: orgAccountsTable.balanceFiat }).from(orgAccountsTable)
    .where(and(
      eq(orgAccountsTable.orgId, picasso.id),
      eq(orgAccountsTable.type, "checking"),
    ))
    .for("update").limit(1);
  return Boolean(pool && pool.balanceFiat >= amountFiat);
}

export async function hasOrganizationMaintenanceFunds(
  tx: Transaction,
  orgId: number,
  amountFiat: number,
): Promise<boolean> {
  const [account] = await tx.select({ balanceFiat: orgAccountsTable.balanceFiat }).from(orgAccountsTable)
    .where(and(
      eq(orgAccountsTable.orgId, orgId),
      eq(orgAccountsTable.type, "checking"),
    ))
    .for("update").limit(1);
  return Boolean(account && account.balanceFiat >= amountFiat);
}

export async function payOrganizationMaintenanceReward(
  tx: Transaction,
  input: {
    orgId: number;
    userId: string;
    amountFiat: number;
    sessionId: string;
    action: string;
    floorNumber: number;
  },
): Promise<{ balance: number; spendable: number } | null> {
  if (!Number.isInteger(input.amountFiat) || input.amountFiat <= 0) {
    throw new Error("Organization maintenance payout must be a positive integer");
  }
  const [account] = await tx.select().from(orgAccountsTable)
    .where(and(
      eq(orgAccountsTable.orgId, input.orgId),
      eq(orgAccountsTable.type, "checking"),
    ))
    .for("update").limit(1);
  if (!account || account.balanceFiat < input.amountFiat) return null;
  const now = new Date();
  const [debited] = await tx.update(orgAccountsTable)
    .set({
      balanceFiat: sql`${orgAccountsTable.balanceFiat} - ${input.amountFiat}`,
      updatedAt: now,
    })
    .where(and(
      eq(orgAccountsTable.id, account.id),
      gte(orgAccountsTable.balanceFiat, input.amountFiat),
    ))
    .returning({ balanceFiat: orgAccountsTable.balanceFiat });
  if (!debited) return null;
  await tx.insert(orgAccountTransactionsTable).values({
    orgId: input.orgId,
    accountType: "checking",
    delta: -input.amountFiat,
    balanceAfter: debited.balanceFiat,
    description: `Organization receptionist paid ${input.action} work · session ${input.sessionId}`,
    category: "private_maintenance_payroll",
    actorUserId: input.userId,
  });
  const credit = await creditFiat(tx, {
    userId: input.userId,
    amountFiat: input.amountFiat,
    description: `Organization receptionist · private ${input.action} · Floor ${input.floorNumber}`,
    kind: "tower_private_work",
    idempotencyKey: `organization-maintenance:${input.sessionId}`,
  });
  return { balance: credit.newBalance, spendable: credit.spendable };
}
