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
): Promise<{ balance: number; spendable: number }> {
  if (!Number.isInteger(input.amountFiat) || input.amountFiat <= 0 || input.amountFiat > 100) {
    throw new Error("Public Tower maintenance payout must be between 1 and 100 FIAT");
  }

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${FUNDING_LOCK_KEY})`);
  const [picasso] = await tx.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = ${PICASSO_ORG_NAME}`)
    .for("update").limit(1);
  if (!picasso) throw new Error("Picasso funding organization is not configured");

  let [pablo] = await tx.select().from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = lower(${PABLO_PUBLIC_WORKS_ORG_NAME})`)
    .for("update").limit(1);
  if (!pablo) {
    [pablo] = await tx.insert(organizationsTable).values({
      name: PABLO_PUBLIC_WORKS_ORG_NAME,
      ownerUserId: "system",
      isDeveloper: false,
    }).returning();
  }

  const picassoAccount = await ensureCheckingAccount(tx, picasso.id);
  const pabloAccount = await ensureCheckingAccount(tx, pablo.id);
  const now = new Date();

  const [picassoDebited] = await tx.update(orgAccountsTable)
    .set({
      balanceFiat: sql`${orgAccountsTable.balanceFiat} - ${input.amountFiat}`,
      updatedAt: now,
    })
    .where(and(
      eq(orgAccountsTable.id, picassoAccount.id),
      gte(orgAccountsTable.balanceFiat, input.amountFiat),
    ))
    .returning({ balanceFiat: orgAccountsTable.balanceFiat });
  if (!picassoDebited) throw new Error("Picasso could not fund this public work order");
  await tx.insert(orgAccountTransactionsTable).values({
    orgId: picasso.id,
    accountType: "checking",
    delta: -input.amountFiat,
    balanceAfter: picassoDebited.balanceFiat,
    description: `Game reward pool → Pablo Corp · public Tower work session ${input.sessionId}`,
    category: "game_reward_pool",
  });

  const [pabloFunded] = await tx.update(orgAccountsTable)
    .set({
      balanceFiat: sql`${orgAccountsTable.balanceFiat} + ${input.amountFiat}`,
      updatedAt: now,
    })
    .where(eq(orgAccountsTable.id, pabloAccount.id))
    .returning({ balanceFiat: orgAccountsTable.balanceFiat });
  await tx.insert(orgAccountTransactionsTable).values({
    orgId: pablo.id,
    accountType: "checking",
    delta: input.amountFiat,
    balanceAfter: pabloFunded.balanceFiat,
    description: `Picasso public Tower work funding · session ${input.sessionId}`,
    category: "public_work_funding",
  });

  const [pabloDebited] = await tx.update(orgAccountsTable)
    .set({
      balanceFiat: sql`${orgAccountsTable.balanceFiat} - ${input.amountFiat}`,
      updatedAt: now,
    })
    .where(and(
      eq(orgAccountsTable.id, pabloAccount.id),
      gte(orgAccountsTable.balanceFiat, input.amountFiat),
    ))
    .returning({ balanceFiat: orgAccountsTable.balanceFiat });
  if (!pabloDebited) throw new Error("Pablo Corp could not settle this public work order");
  await tx.insert(orgAccountTransactionsTable).values({
    orgId: pablo.id,
    accountType: "checking",
    delta: -input.amountFiat,
    balanceAfter: pabloDebited.balanceFiat,
    description: `Public Tower ${input.action} payroll · Floor ${input.floorNumber}`,
    category: "public_work_payroll",
    actorUserId: input.userId,
  });

  const credit = await creditFiat(tx, {
    userId: input.userId,
    amountFiat: input.amountFiat,
    description: `Pablo Corp public Tower ${input.action} · Floor ${input.floorNumber}`,
    kind: "tower_public_work",
    idempotencyKey: `pablo-public-work:${input.sessionId}`,
  });
  return { balance: credit.newBalance, spendable: credit.spendable };
}

async function ensureCheckingAccount(tx: Transaction, orgId: number) {
  await tx.insert(orgAccountsTable).values({
    orgId,
    type: "checking",
    label: "ORG CHECKING",
    balanceFiat: 0,
    apyBps: 0,
  }).onConflictDoNothing();
  const [account] = await tx.select().from(orgAccountsTable)
    .where(and(eq(orgAccountsTable.orgId, orgId), eq(orgAccountsTable.type, "checking")))
    .for("update").limit(1);
  if (!account) throw new Error("Organization checking account could not be initialized");
  return account;
}
