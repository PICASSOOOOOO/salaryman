import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  towerOperationsLedgerTable,
  towerOperationsStateTable,
  towerShopAccountsTable,
  towerShopLedgerTable,
  towerShopShipmentsTable,
} from "@workspace/db";
import { advanceTowerFinance } from "./tower-finance";
import { towerShopRestockAvailableAt, type TowerShopOrderQuote } from "./tower-shop-pricing";

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

export async function settleTowerShopSupplierOrderTx(
  tx: DbTx,
  args: {
    businessKey: string;
    requestKey: string;
    requestedByUserId: string;
    lines: Array<{ itemId: string; quantity: number }>;
    restockCooldowns?: Array<{ itemId: string; cooldownMs: number }>;
    quote: TowerShopOrderQuote;
    btcMultiplierBps: number;
    demandIndex: number;
    supplyIndex: number;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const [prior] = await tx.select().from(towerShopShipmentsTable)
    .where(eq(towerShopShipmentsTable.requestKey, args.requestKey))
    .limit(1);
  if (prior) return { ok: true as const, duplicate: true, shipment: prior };

  for (const cooldown of [...(args.restockCooldowns ?? [])].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
    const lockKey = `tower-shop-restock:${args.businessKey}:${cooldown.itemId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [lastOrder] = await tx.select({ requestedAt: towerShopShipmentsTable.requestedAt })
      .from(towerShopShipmentsTable)
      .where(and(
        eq(towerShopShipmentsTable.businessKey, args.businessKey),
        sql`${towerShopShipmentsTable.status} <> 'cancelled'`,
        sql`${towerShopShipmentsTable.lines} @> ${JSON.stringify([{ itemId: cooldown.itemId }])}::jsonb`,
      ))
      .orderBy(desc(towerShopShipmentsTable.requestedAt))
      .limit(1);
    const nextAvailableAt = lastOrder
      ? towerShopRestockAvailableAt(lastOrder.requestedAt, cooldown.cooldownMs)
      : null;
    if (nextAvailableAt && nextAvailableAt > now) {
      return {
        ok: false as const,
        reason: "restock_cooldown" as const,
        itemId: cooldown.itemId,
        nextAvailableAt,
      };
    }
  }

  const funding = await ensureTowerShopWorkingCapitalTx(tx, args.businessKey, now);
  if (!funding.ok) return { ok: false as const, reason: "tower_funds" as const };
  const [committedRetry] = await tx.select().from(towerShopShipmentsTable)
    .where(eq(towerShopShipmentsTable.requestKey, args.requestKey))
    .limit(1);
  if (committedRetry) return { ok: true as const, duplicate: true, shipment: committedRetry };
  if (funding.account.balanceFiat < args.quote.shopTotalFiat) {
    return {
      ok: false as const,
      reason: "shop_funds" as const,
      balanceFiat: funding.account.balanceFiat,
      requiredFiat: args.quote.shopTotalFiat,
    };
  }

  const shippingCompanyKey = "tower-shipping-company";
  const supplierKey = "outside-suppliers";
  const lockLedgerAccount = async (type: string, key: string) => {
    const advisoryKey = `tower-shop-ledger:${type}:${key}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${advisoryKey}))`);
    const [row] = await tx.select({
      balance: sql<number>`coalesce(sum(case when ${towerShopLedgerTable.direction} = 'credit' then ${towerShopLedgerTable.amountFiat} else -${towerShopLedgerTable.amountFiat} end), 0)`,
    }).from(towerShopLedgerTable).where(and(
      eq(towerShopLedgerTable.accountType, type),
      eq(towerShopLedgerTable.accountKey, key),
    ));
    const balance = Number(row?.balance ?? 0);
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_FIAT) {
      throw new Error(`Tower shop ledger balance is invalid for ${type}:${key}`);
    }
    return balance;
  };

  const shipperBalance = await lockLedgerAccount("shipping_company", shippingCompanyKey);
  const supplierBalance = await lockLedgerAccount("external_supplier", supplierKey);
  const shipmentId = randomUUID();
  const shipperAfterPayment = shipperBalance + args.quote.shopTotalFiat;
  const shipperAfterProcurement = shipperAfterPayment - args.quote.supplierCostFiat;
  const supplierAfterPayment = supplierBalance + args.quote.supplierCostFiat;
  if ([shipperAfterPayment, shipperAfterProcurement, supplierAfterPayment]
    .some((balance) => !Number.isSafeInteger(balance) || balance < 0 || balance > MAX_FIAT)) {
    throw new Error("Tower shop supplier settlement exceeds supported FIAT balances");
  }

  const [shipment] = await tx.insert(towerShopShipmentsTable).values({
    id: shipmentId,
    requestKey: args.requestKey,
    businessKey: args.businessKey,
    shippingCompanyKey,
    status: "supplier_processing",
    lines: args.lines,
    goodsCostFiat: args.quote.goodsCostFiat,
    deliveryFeeFiat: args.quote.deliveryFeeFiat,
    supplierCostFiat: args.quote.supplierCostFiat,
    btcMultiplierBps: args.btcMultiplierBps,
    demandIndex: args.demandIndex,
    supplyIndex: args.supplyIndex,
    requestedByUserId: args.requestedByUserId,
    requestedAt: now,
    supplierOrderedAt: now,
    updatedAt: now,
  }).returning();
  if (!shipment) throw new Error("Tower shop shipment could not be created");

  const shopAfterPayment = funding.account.balanceFiat - args.quote.shopTotalFiat;
  await tx.update(towerShopAccountsTable).set({
    balanceFiat: shopAfterPayment,
    totalOrderSpendFiat: funding.account.totalOrderSpendFiat + args.quote.shopTotalFiat,
    updatedAt: now,
  }).where(eq(towerShopAccountsTable.businessKey, args.businessKey));
  const eventBase = `tower-shop-order:${shipmentId}`;
  await tx.insert(towerShopLedgerTable).values([
    {
      eventKey: `${eventBase}:shop-debit`,
      shipmentId,
      accountType: "shop",
      accountKey: args.businessKey,
      direction: "debit",
      amountFiat: args.quote.shopTotalFiat,
      balanceAfterFiat: shopAfterPayment,
      counterpartyType: "shipping_company",
      counterpartyKey: shippingCompanyKey,
      description: "Supplier order and delivery payment",
      createdAt: now,
    },
    {
      eventKey: `${eventBase}:shipper-credit`,
      shipmentId,
      accountType: "shipping_company",
      accountKey: shippingCompanyKey,
      direction: "credit",
      amountFiat: args.quote.shopTotalFiat,
      balanceAfterFiat: shipperAfterPayment,
      counterpartyType: "shop",
      counterpartyKey: args.businessKey,
      description: "Shop supplier-order payment",
      createdAt: now,
    },
    {
      eventKey: `${eventBase}:shipper-procurement`,
      shipmentId,
      accountType: "shipping_company",
      accountKey: shippingCompanyKey,
      direction: "debit",
      amountFiat: args.quote.supplierCostFiat,
      balanceAfterFiat: shipperAfterProcurement,
      counterpartyType: "external_supplier",
      counterpartyKey: supplierKey,
      description: "Outside supplier procurement",
      createdAt: now,
    },
    {
      eventKey: `${eventBase}:supplier-credit`,
      shipmentId,
      accountType: "external_supplier",
      accountKey: supplierKey,
      direction: "credit",
      amountFiat: args.quote.supplierCostFiat,
      balanceAfterFiat: supplierAfterPayment,
      counterpartyType: "shipping_company",
      counterpartyKey: shippingCompanyKey,
      description: "Payment for outside goods procurement",
      createdAt: now,
    },
  ]);

  return { ok: true as const, duplicate: false, shipment, balanceFiat: shopAfterPayment };
}
