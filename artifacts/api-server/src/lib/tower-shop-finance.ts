import { and, eq } from "drizzle-orm";
import {
  towerOperationsLedgerTable,
  towerOperationsStateTable,
  towerShopAccountsTable,
  towerShopLedgerTable,
} from "@workspace/db";
import { advanceTowerFinance } from "./tower-finance";

type DbTx = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];

// Tunable opening capital; it is transferred once from Tower funds, not created.
export const TOWER_SHOP_OPENING_CAPITAL_FIAT = 25_000;
const TOWER_BUILDING_KEY = "shadow_tower";
const MAX_FIAT = 2_147_483_647;

export async function ensureTowerShopWorkingCapitalTx(
  tx: DbTx,
  businessKey: string,
  now = new Date(),
) {
  if (!/^[a-z0-9_-]{1,80}$/i.test(businessKey)) {
    throw new Error("Invalid Tower shop business key");
  }

  await tx.insert(towerShopAccountsTable)
    .values({ businessKey, updatedAt: now })
    .onConflictDoNothing();
  const [account] = await tx.select().from(towerShopAccountsTable)
    .where(eq(towerShopAccountsTable.businessKey, businessKey))
    .for("update")
    .limit(1);
  if (!account) throw new Error("Tower shop account could not be initialized");
  if (account.openingCapitalFiat > 0) return { ok: true as const, account, funded: false };

  await advanceTowerFinance(tx, now);
  const [tower] = await tx.select().from(towerOperationsStateTable)
    .where(eq(towerOperationsStateTable.buildingKey, TOWER_BUILDING_KEY))
    .for("update")
    .limit(1);
  if (!tower) throw new Error("Tower operations account could not be locked");

  const amountFiat = TOWER_SHOP_OPENING_CAPITAL_FIAT;
  if (tower.operatingBalanceFiat < amountFiat) {
    return { ok: false as const, reason: "tower_funds" as const, account };
  }

  const capitalEventKey = `tower-shop-capital:${businessKey}:v1`;
  const [prior] = await tx.select({ id: towerOperationsLedgerTable.id })
    .from(towerOperationsLedgerTable)
    .where(eq(towerOperationsLedgerTable.eventKey, capitalEventKey))
    .limit(1);
  if (prior) {
    throw new Error("Tower shop capital event exists without matching account funding");
  }

  const towerBalanceAfterFiat = tower.operatingBalanceFiat - amountFiat;
  if (!Number.isSafeInteger(towerBalanceAfterFiat) || towerBalanceAfterFiat < 0 || towerBalanceAfterFiat > MAX_FIAT) {
    throw new Error("Tower shop capital transfer is outside the supported FIAT range");
  }

  await tx.insert(towerOperationsLedgerTable).values({
    eventKey: capitalEventKey,
    eventType: "shop_capital_transfer",
    category: businessKey.slice(0, 32),
    amountFiat,
    balanceAfterFiat: towerBalanceAfterFiat,
    description: `Opening working capital for Tower shop ${businessKey}`,
    createdAt: now,
  });
  await tx.update(towerOperationsStateTable).set({
    operatingBalanceFiat: towerBalanceAfterFiat,
    updatedAt: now,
  }).where(eq(towerOperationsStateTable.buildingKey, TOWER_BUILDING_KEY));

  const [fundedAccount] = await tx.update(towerShopAccountsTable).set({
    balanceFiat: amountFiat,
    openingCapitalFiat: amountFiat,
    updatedAt: now,
  }).where(and(
    eq(towerShopAccountsTable.businessKey, businessKey),
    eq(towerShopAccountsTable.openingCapitalFiat, 0),
  )).returning();
  if (!fundedAccount) throw new Error("Tower shop account changed during capital transfer");

  await tx.insert(towerShopLedgerTable).values({
    eventKey: capitalEventKey,
    accountType: "shop",
    accountKey: businessKey,
    direction: "credit",
    amountFiat,
    balanceAfterFiat: amountFiat,
    counterpartyType: "tower_fund",
    counterpartyKey: TOWER_BUILDING_KEY,
    description: "Opening working capital",
    createdAt: now,
  });

  return { ok: true as const, account: fundedAccount, funded: true };
}
