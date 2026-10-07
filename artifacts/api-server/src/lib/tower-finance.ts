import { randomUUID } from "node:crypto";
import { and, eq, gte, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  bankAccountsTable,
  db,
  desktopOfficePresenceTable,
  orgMembersTable,
  shadowTowerOfficeUnitsTable,
  towerOperationsLedgerTable,
  towerOperationsStateTable,
} from "@workspace/db";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const TOWER_POWER_BILL_PER_DAY_FIAT = 8_000;
export const TOWER_WATER_BILL_PER_DAY_FIAT = 3_000;
export const TOWER_OPENING_OPERATING_CAPITAL_FIAT = 250_000;
export const TOWER_BACKUP_FUEL_DAYS_MAX = 5;
export const TOWER_WEALTHY_BALANCE_FIAT = 100_000;

const BUILDING_KEY = "shadow_tower";
const DAY_MS = 24 * 60 * 60 * 1_000;
const BACKUP_CUSTOMER_CAPACITY = 8;
const BACKUP_INFRASTRUCTURE_CAPACITY = 2;
const ACTIVE_PRESENCE_MS = 10_000;
const SERVICE_CUSTOMER_LOOKBACK_MS = 30 * DAY_MS;
const MAX_FIAT = 2_147_483_647;

export function calculateTowerPriceMultiplier(balanceFiat: number): number {
  const dailyBills = TOWER_POWER_BILL_PER_DAY_FIAT + TOWER_WATER_BILL_PER_DAY_FIAT;
  const healthyReserve = dailyBills * 10;
  const normalizedReserve = Math.max(0, Math.min(1, Math.max(0, balanceFiat) / healthyReserve));
  return Number((2 - normalizedReserve).toFixed(2));
}

function safeFiat(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FIAT) {
    throw new Error(`Tower finance ${label} is outside the supported FIAT range`);
  }
  return value;
}

async function lockTowerState(tx: DbTx, now: Date) {
  await tx.insert(towerOperationsStateTable)
    .values({ buildingKey: BUILDING_KEY, updatedAt: now })
    .onConflictDoNothing();
  const [state] = await tx.select().from(towerOperationsStateTable)
    .where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY))
    .for("update")
    .limit(1);
  if (!state) throw new Error("Tower finance state could not be initialized");

  const openingEventKey = `tower:${BUILDING_KEY}:opening-capital:v1`;
  const [openingEvent] = await tx.select({ id: towerOperationsLedgerTable.id })
    .from(towerOperationsLedgerTable)
    .where(eq(towerOperationsLedgerTable.eventKey, openingEventKey))
    .limit(1);
  if (!openingEvent) {
    await tx.insert(towerOperationsLedgerTable).values({
      eventKey: openingEventKey,
      eventType: "opening_capital",
      category: "pablo_corp",
      amountFiat: TOWER_OPENING_OPERATING_CAPITAL_FIAT,
      balanceAfterFiat: state.operatingBalanceFiat,
      description: "Opening Tower operating reserve",
      createdAt: now,
    }).onConflictDoNothing();
  }
  return state;
}

export async function advanceTowerFinance(tx: DbTx, now = new Date()) {
  const state = await lockTowerState(tx, now);
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - state.lastUtilityBillAt.getTime()) / DAY_MS));
  const addedPowerDue = safeFiat(elapsedDays * TOWER_POWER_BILL_PER_DAY_FIAT, "power bill");
  const addedWaterDue = safeFiat(elapsedDays * TOWER_WATER_BILL_PER_DAY_FIAT, "water bill");
  let powerDue = safeFiat(state.powerBillDueFiat + addedPowerDue, "power arrears");
  let waterDue = safeFiat(state.waterBillDueFiat + addedWaterDue, "water arrears");
  let balance = state.operatingBalanceFiat;

  // Keep the grid ahead of water service when funds are limited; any
  // outstanding amount still disables that service rather than going negative.
  const powerPaid = Math.min(balance, powerDue);
  balance -= powerPaid;
  powerDue -= powerPaid;
  const waterPaid = Math.min(balance, waterDue);
  balance -= waterPaid;
  waterDue -= waterPaid;

  let backupFuelDays = state.backupFuelDays;
  if (elapsedDays > 0) {
    backupFuelDays = powerDue > 0
      ? Math.max(0, backupFuelDays - elapsedDays)
      : Math.min(TOWER_BACKUP_FUEL_DAYS_MAX, backupFuelDays + elapsedDays);
  }
  const lastUtilityBillAt = new Date(state.lastUtilityBillAt.getTime() + elapsedDays * DAY_MS);

  if (powerPaid > 0) {
    await tx.insert(towerOperationsLedgerTable).values({
      eventKey: `tower:${BUILDING_KEY}:bill:${randomUUID()}`,
      eventType: "bill_payment",
      category: "power",
      amountFiat: powerPaid,
      balanceAfterFiat: balance + waterPaid,
      description: `${elapsedDays} day(s) of Tower power service`,
      createdAt: now,
    });
  }
  if (waterPaid > 0) {
    await tx.insert(towerOperationsLedgerTable).values({
      eventKey: `tower:${BUILDING_KEY}:bill:${randomUUID()}`,
      eventType: "bill_payment",
      category: "water",
      amountFiat: waterPaid,
      balanceAfterFiat: balance,
      description: `${elapsedDays} day(s) of Tower water service`,
      createdAt: now,
    });
  }

  const [updated] = await tx.update(towerOperationsStateTable).set({
    operatingBalanceFiat: safeFiat(balance, "operating balance"),
    powerBillDueFiat: powerDue,
    waterBillDueFiat: waterDue,
    lastUtilityBillAt,
    backupFuelDays,
    updatedAt: now,
  }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY)).returning();
  if (!updated) throw new Error("Tower finance state disappeared during billing");

  return {
    operatingBalanceFiat: updated.operatingBalanceFiat,
    powerBillDueFiat: updated.powerBillDueFiat,
    waterBillDueFiat: updated.waterBillDueFiat,
    powerBillPaid: updated.powerBillDueFiat === 0,
    waterBillPaid: updated.waterBillDueFiat === 0,
    backupFuelDays: updated.backupFuelDays,
    priceMultiplier: calculateTowerPriceMultiplier(updated.operatingBalanceFiat),
    priceMultiplierPct: Math.round(calculateTowerPriceMultiplier(updated.operatingBalanceFiat) * 100),
    observedAt: now.toISOString(),
  };
}

export async function recordTowerCompanyRevenueTx(
  tx: DbTx,
  args: {
    eventKey: string;
    category: string;
    amountFiat: number;
    userId?: string | null;
    description: string;
    now?: Date;
  },
) {
  const amountFiat = Math.round(args.amountFiat);
  if (!args.eventKey || !Number.isSafeInteger(amountFiat) || amountFiat <= 0) {
    throw new Error("Tower company revenue requires an event key and positive FIAT amount");
  }
  const now = args.now ?? new Date();
  await advanceTowerFinance(tx, now);
  const [prior] = await tx.select({ id: towerOperationsLedgerTable.id })
    .from(towerOperationsLedgerTable)
    .where(eq(towerOperationsLedgerTable.eventKey, args.eventKey))
    .for("update")
    .limit(1);
  if (prior) return { duplicate: true as const, finance: await advanceTowerFinance(tx, now) };

  const [state] = await tx.select().from(towerOperationsStateTable)
    .where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY))
    .for("update")
    .limit(1);
  if (!state) throw new Error("Tower finance state could not be locked");
  const balanceAfterFiat = safeFiat(state.operatingBalanceFiat + amountFiat, "revenue balance");
  await tx.insert(towerOperationsLedgerTable).values({
    eventKey: args.eventKey,
    eventType: "company_revenue",
    category: args.category.slice(0, 32),
    userId: args.userId ?? null,
    amountFiat,
    balanceAfterFiat,
    description: args.description.slice(0, 2_000),
    createdAt: now,
  }).onConflictDoNothing();
  await tx.update(towerOperationsStateTable).set({
    operatingBalanceFiat: balanceAfterFiat,
    updatedAt: now,
  }).where(eq(towerOperationsStateTable.buildingKey, BUILDING_KEY));
  return { duplicate: false as const, finance: await advanceTowerFinance(tx, now) };
}

export async function getTowerPriceMultiplier(now = new Date()): Promise<number> {
  return db.transaction(async (tx) => (await advanceTowerFinance(tx, now)).priceMultiplier);
}

export async function towerBackupAllocation(
  tx: DbTx,
  now: Date,
  currentUserId: string,
  powerOutage: boolean,
  backupFuelDays: number,
) {
  if (!powerOutage || backupFuelDays <= 0) {
    return {
      active: false,
      eligibleCustomers: 0,
      poweredCustomers: 0,
      poweredInfrastructureUnits: 0,
      currentUserPowered: false,
    };
  }

  const presentRows = await tx.select({ userId: desktopOfficePresenceTable.userId })
    .from(desktopOfficePresenceTable)
    .where(and(
      gte(desktopOfficePresenceTable.lastSeenAt, new Date(now.getTime() - ACTIVE_PRESENCE_MS)),
      gte(desktopOfficePresenceTable.floorNumber, 1),
      lte(desktopOfficePresenceTable.floorNumber, 6),
    ));
  const presentUserIds = [...new Set(presentRows.map((row) => row.userId))];
  if (!presentUserIds.length) {
    return {
      active: true,
      eligibleCustomers: 0,
      poweredCustomers: 0,
      poweredInfrastructureUnits: BACKUP_INFRASTRUCTURE_CAPACITY,
      currentUserPowered: false,
    };
  }

  const paidUserIds = new Set<string>();
  const occupiedUnits = await tx.select({
    ownerUserId: shadowTowerOfficeUnitsTable.ownerUserId,
    orgId: shadowTowerOfficeUnitsTable.orgId,
  }).from(shadowTowerOfficeUnitsTable)
    .where(and(
      eq(shadowTowerOfficeUnitsTable.status, "occupied"),
      or(isNull(shadowTowerOfficeUnitsTable.leaseExpiresAt), gt(shadowTowerOfficeUnitsTable.leaseExpiresAt, now)),
    ));
  const orgIds = new Set<number>();
  for (const unit of occupiedUnits) {
    if (unit.ownerUserId) paidUserIds.add(unit.ownerUserId);
    if (unit.orgId) orgIds.add(unit.orgId);
  }
  if (orgIds.size) {
    const members = await tx.select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(inArray(orgMembersTable.orgId, [...orgIds]), eq(orgMembersTable.status, "active")));
    for (const member of members) paidUserIds.add(member.userId);
  }

  const serviceBuyers = await tx.select({ userId: towerOperationsLedgerTable.userId })
    .from(towerOperationsLedgerTable)
    .where(and(
      eq(towerOperationsLedgerTable.eventType, "company_revenue"),
      eq(towerOperationsLedgerTable.category, "tower_vending"),
      gte(towerOperationsLedgerTable.createdAt, new Date(now.getTime() - SERVICE_CUSTOMER_LOOKBACK_MS)),
    ));
  for (const buyer of serviceBuyers) if (buyer.userId) paidUserIds.add(buyer.userId);

  const wealthRows = await tx.select({
    userId: bankAccountsTable.userId,
    balanceFiat: sql<number>`COALESCE(SUM(${bankAccountsTable.balance}), 0)::int`,
  }).from(bankAccountsTable)
    .where(and(
      inArray(bankAccountsTable.userId, presentUserIds),
      eq(bankAccountsTable.currency, "FIAT"),
    ))
    .groupBy(bankAccountsTable.userId);
  const wealthByUser = new Map(wealthRows.map((row) => [row.userId, Number(row.balanceFiat)]));
  const eligible = presentUserIds
    .map((userId) => ({
      userId,
      paid: paidUserIds.has(userId),
      balanceFiat: wealthByUser.get(userId) ?? 0,
    }))
    .filter((entry) => entry.paid || entry.balanceFiat >= TOWER_WEALTHY_BALANCE_FIAT)
    .sort((a, b) =>
      Number(b.paid) - Number(a.paid)
      || b.balanceFiat - a.balanceFiat
      || a.userId.localeCompare(b.userId),
    );
  const poweredCustomers = eligible.slice(0, BACKUP_CUSTOMER_CAPACITY);
  const poweredInfrastructureUnits = Math.min(
    BACKUP_INFRASTRUCTURE_CAPACITY,
    Math.max(0, BACKUP_CUSTOMER_CAPACITY - poweredCustomers.length),
  );
  return {
    active: true,
    eligibleCustomers: eligible.length,
    poweredCustomers: poweredCustomers.length,
    poweredInfrastructureUnits,
    currentUserPowered: poweredCustomers.some((entry) => entry.userId === currentUserId),
  };
}
