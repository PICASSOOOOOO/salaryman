import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const towerShopAccountsTable = pgTable(
  "tower_shop_accounts",
  {
    businessKey: varchar("business_key", { length: 80 }).primaryKey(),
    balanceFiat: integer("balance_fiat").notNull().default(0),
    openingCapitalFiat: integer("opening_capital_fiat").notNull().default(0),
    totalSalesFiat: integer("total_sales_fiat").notNull().default(0),
    totalOrderSpendFiat: integer("total_order_spend_fiat").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("tower_shop_accounts_balance_check", sql`${table.balanceFiat} between 0 and 2147483647`),
    check("tower_shop_accounts_capital_check", sql`${table.openingCapitalFiat} between 0 and 2147483647`),
    check("tower_shop_accounts_sales_check", sql`${table.totalSalesFiat} between 0 and 2147483647`),
    check("tower_shop_accounts_orders_check", sql`${table.totalOrderSpendFiat} between 0 and 2147483647`),
  ],
);

export const towerShopInventoryTable = pgTable(
  "tower_shop_inventory",
  {
    businessKey: varchar("business_key", { length: 80 }).notNull(),
    itemId: varchar("item_id", { length: 80 }).notNull(),
    storedQuantity: integer("stored_quantity").notNull().default(0),
    shelfQuantity: integer("shelf_quantity").notNull().default(0),
    storageCapacity: integer("storage_capacity").notNull().default(0),
    shelfCapacity: integer("shelf_capacity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      name: "tower_shop_inventory_business_item_pk",
      columns: [table.businessKey, table.itemId],
    }),
    index("tower_shop_inventory_item_idx").on(table.itemId),
    foreignKey({
      name: "tower_shop_inventory_account_fk",
      columns: [table.businessKey],
      foreignColumns: [towerShopAccountsTable.businessKey],
    }).onDelete("cascade"),
    check("tower_shop_inventory_stored_check", sql`${table.storedQuantity} between 0 and 1000000`),
    check("tower_shop_inventory_shelf_check", sql`${table.shelfQuantity} between 0 and 1000000`),
    check("tower_shop_inventory_storage_capacity_check", sql`${table.storageCapacity} between 0 and 1000000`),
    check("tower_shop_inventory_shelf_capacity_check", sql`${table.shelfCapacity} between 0 and 1000000`),
    check("tower_shop_inventory_storage_fit_check", sql`${table.storedQuantity} <= ${table.storageCapacity}`),
    check("tower_shop_inventory_shelf_fit_check", sql`${table.shelfQuantity} <= ${table.shelfCapacity}`),
  ],
);

export const towerShopShipmentsTable = pgTable(
  "tower_shop_shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestKey: varchar("request_key", { length: 160 }).notNull(),
    businessKey: varchar("business_key", { length: 80 }).notNull(),
    shippingCompanyKey: varchar("shipping_company_key", { length: 80 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("ordered"),
    lines: jsonb("lines").$type<Array<{ itemId: string; quantity: number }>>().notNull(),
    goodsCostFiat: integer("goods_cost_fiat").notNull(),
    deliveryFeeFiat: integer("delivery_fee_fiat").notNull(),
    supplierCostFiat: integer("supplier_cost_fiat").notNull(),
    btcMultiplierBps: integer("btc_multiplier_bps").notNull(),
    demandIndex: integer("demand_index").notNull(),
    supplyIndex: integer("supply_index").notNull(),
    requestedByUserId: varchar("requested_by_user_id", { length: 256 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    supplierOrderedAt: timestamp("supplier_ordered_at", { withTimezone: true }),
    arrivedAtDockAt: timestamp("arrived_at_dock_at", { withTimezone: true }),
    deliveredAtStoreAt: timestamp("delivered_at_store_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tower_shop_shipments_request_unique").on(table.requestKey),
    foreignKey({
      name: "tower_shop_shipment_account_fk",
      columns: [table.businessKey],
      foreignColumns: [towerShopAccountsTable.businessKey],
    }).onDelete("restrict"),
    index("tower_shop_shipments_business_status_idx").on(table.businessKey, table.status, table.requestedAt),
    check("tower_shop_shipments_status_check", sql`${table.status} in ('ordered', 'supplier_processing', 'at_dock', 'in_delivery', 'delivered', 'cancelled')`),
    check("tower_shop_shipments_goods_cost_check", sql`${table.goodsCostFiat} >= 0`),
    check("tower_shop_shipments_delivery_fee_check", sql`${table.deliveryFeeFiat} >= 0`),
    check("tower_shop_shipments_supplier_cost_check", sql`${table.supplierCostFiat} >= 0`),
    check("tower_shop_shipments_btc_multiplier_check", sql`${table.btcMultiplierBps} between 4000 and 40000`),
    check("tower_shop_shipments_demand_check", sql`${table.demandIndex} between 0 and 10000`),
    check("tower_shop_shipments_supply_check", sql`${table.supplyIndex} between 0 and 10000`),
  ],
);

export const towerShopLedgerTable = pgTable(
  "tower_shop_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    shipmentId: uuid("shipment_id").references(() => towerShopShipmentsTable.id, { onDelete: "restrict" }),
    accountType: varchar("account_type", { length: 24 }).notNull(),
    accountKey: varchar("account_key", { length: 80 }).notNull(),
    direction: varchar("direction", { length: 8 }).notNull(),
    amountFiat: integer("amount_fiat").notNull(),
    balanceAfterFiat: integer("balance_after_fiat").notNull(),
    counterpartyType: varchar("counterparty_type", { length: 24 }),
    counterpartyKey: varchar("counterparty_key", { length: 80 }),
    description: varchar("description", { length: 500 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tower_shop_ledger_event_unique").on(table.eventKey),
    index("tower_shop_ledger_account_created_idx").on(table.accountType, table.accountKey, table.createdAt),
    index("tower_shop_ledger_shipment_idx").on(table.shipmentId),
    check("tower_shop_ledger_account_type_check", sql`${table.accountType} in ('shop', 'shipping_company', 'external_supplier', 'tower_fund')`),
    check("tower_shop_ledger_direction_check", sql`${table.direction} in ('credit', 'debit')`),
    check("tower_shop_ledger_amount_check", sql`${table.amountFiat} > 0`),
    check("tower_shop_ledger_balance_check", sql`${table.balanceAfterFiat} between 0 and 2147483647`),
  ],
);

export const insertTowerShopShipmentSchema = createInsertSchema(towerShopShipmentsTable).omit({
  id: true,
  requestedAt: true,
  supplierOrderedAt: true,
  arrivedAtDockAt: true,
  deliveredAtStoreAt: true,
  updatedAt: true,
}).extend({
  lines: z.array(z.object({
    itemId: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(1_000_000),
  })).min(1).max(100),
});

export type TowerShopAccount = typeof towerShopAccountsTable.$inferSelect;
export type TowerShopInventory = typeof towerShopInventoryTable.$inferSelect;
export type TowerShopShipment = typeof towerShopShipmentsTable.$inferSelect;
export type InsertTowerShopShipment = z.infer<typeof insertTowerShopShipmentSchema>;
export type TowerShopLedgerEntry = typeof towerShopLedgerTable.$inferSelect;
