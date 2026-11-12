CREATE TABLE IF NOT EXISTS "tower_shop_accounts" (
  "business_key" varchar(80) PRIMARY KEY NOT NULL,
  "balance_fiat" integer DEFAULT 0 NOT NULL,
  "opening_capital_fiat" integer DEFAULT 0 NOT NULL,
  "total_sales_fiat" integer DEFAULT 0 NOT NULL,
  "total_order_spend_fiat" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_shop_accounts_balance_check"
    CHECK ("balance_fiat" between 0 and 2147483647),
  CONSTRAINT "tower_shop_accounts_capital_check"
    CHECK ("opening_capital_fiat" between 0 and 2147483647),
  CONSTRAINT "tower_shop_accounts_sales_check"
    CHECK ("total_sales_fiat" between 0 and 2147483647),
  CONSTRAINT "tower_shop_accounts_orders_check"
    CHECK ("total_order_spend_fiat" between 0 and 2147483647)
);

CREATE TABLE IF NOT EXISTS "tower_shop_inventory" (
  "business_key" varchar(80) NOT NULL,
  "item_id" varchar(80) NOT NULL,
  "stored_quantity" integer DEFAULT 0 NOT NULL,
  "shelf_quantity" integer DEFAULT 0 NOT NULL,
  "storage_capacity" integer DEFAULT 0 NOT NULL,
  "shelf_capacity" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_shop_inventory_business_item_pk" PRIMARY KEY ("business_key", "item_id"),
  CONSTRAINT "tower_shop_inventory_business_key_tower_shop_accounts_business_key_fk"
    FOREIGN KEY ("business_key") REFERENCES "tower_shop_accounts"("business_key") ON DELETE cascade,
  CONSTRAINT "tower_shop_inventory_stored_check" CHECK ("stored_quantity" between 0 and 1000000),
  CONSTRAINT "tower_shop_inventory_shelf_check" CHECK ("shelf_quantity" between 0 and 1000000),
  CONSTRAINT "tower_shop_inventory_storage_capacity_check" CHECK ("storage_capacity" between 0 and 1000000),
  CONSTRAINT "tower_shop_inventory_shelf_capacity_check" CHECK ("shelf_capacity" between 0 and 1000000),
  CONSTRAINT "tower_shop_inventory_storage_fit_check" CHECK ("stored_quantity" <= "storage_capacity"),
  CONSTRAINT "tower_shop_inventory_shelf_fit_check" CHECK ("shelf_quantity" <= "shelf_capacity")
);
CREATE INDEX IF NOT EXISTS "tower_shop_inventory_item_idx" ON "tower_shop_inventory" ("item_id");

CREATE TABLE IF NOT EXISTS "tower_shop_shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_key" varchar(160) NOT NULL,
  "business_key" varchar(80) NOT NULL,
  "shipping_company_key" varchar(80) NOT NULL,
  "status" varchar(24) DEFAULT 'ordered' NOT NULL,
  "lines" jsonb NOT NULL,
  "goods_cost_fiat" integer NOT NULL,
  "delivery_fee_fiat" integer NOT NULL,
  "supplier_cost_fiat" integer NOT NULL,
  "btc_multiplier_bps" integer NOT NULL,
  "demand_index" integer NOT NULL,
  "supply_index" integer NOT NULL,
  "requested_by_user_id" varchar(256),
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "supplier_ordered_at" timestamp with time zone,
  "arrived_at_dock_at" timestamp with time zone,
  "delivered_at_store_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_shop_shipments_business_key_tower_shop_accounts_business_key_fk"
    FOREIGN KEY ("business_key") REFERENCES "tower_shop_accounts"("business_key") ON DELETE restrict,
  CONSTRAINT "tower_shop_shipments_status_check"
    CHECK ("status" in ('ordered', 'supplier_processing', 'at_dock', 'in_delivery', 'delivered', 'cancelled')),
  CONSTRAINT "tower_shop_shipments_goods_cost_check" CHECK ("goods_cost_fiat" >= 0),
  CONSTRAINT "tower_shop_shipments_delivery_fee_check" CHECK ("delivery_fee_fiat" >= 0),
  CONSTRAINT "tower_shop_shipments_supplier_cost_check" CHECK ("supplier_cost_fiat" >= 0),
  CONSTRAINT "tower_shop_shipments_btc_multiplier_check" CHECK ("btc_multiplier_bps" between 4000 and 40000),
  CONSTRAINT "tower_shop_shipments_demand_check" CHECK ("demand_index" between 0 and 10000),
  CONSTRAINT "tower_shop_shipments_supply_check" CHECK ("supply_index" between 0 and 10000)
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_shop_shipments_request_unique" ON "tower_shop_shipments" ("request_key");
CREATE INDEX IF NOT EXISTS "tower_shop_shipments_business_status_idx"
  ON "tower_shop_shipments" ("business_key", "status", "requested_at");

CREATE TABLE IF NOT EXISTS "tower_shop_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_key" varchar(180) NOT NULL,
  "shipment_id" uuid,
  "account_type" varchar(24) NOT NULL,
  "account_key" varchar(80) NOT NULL,
  "direction" varchar(8) NOT NULL,
  "amount_fiat" integer NOT NULL,
  "balance_after_fiat" integer NOT NULL,
  "counterparty_type" varchar(24),
  "counterparty_key" varchar(80),
  "description" varchar(500) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tower_shop_ledger_shipment_id_tower_shop_shipments_id_fk"
    FOREIGN KEY ("shipment_id") REFERENCES "tower_shop_shipments"("id") ON DELETE restrict,
  CONSTRAINT "tower_shop_ledger_account_type_check"
    CHECK ("account_type" in ('shop', 'shipping_company', 'external_supplier', 'tower_fund')),
  CONSTRAINT "tower_shop_ledger_direction_check" CHECK ("direction" in ('credit', 'debit')),
  CONSTRAINT "tower_shop_ledger_amount_check" CHECK ("amount_fiat" > 0),
  CONSTRAINT "tower_shop_ledger_balance_check" CHECK ("balance_after_fiat" between 0 and 2147483647)
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_shop_ledger_event_unique" ON "tower_shop_ledger" ("event_key");
CREATE INDEX IF NOT EXISTS "tower_shop_ledger_account_created_idx"
  ON "tower_shop_ledger" ("account_type", "account_key", "created_at");
CREATE INDEX IF NOT EXISTS "tower_shop_ledger_shipment_idx" ON "tower_shop_ledger" ("shipment_id");

ALTER TABLE "tower_operations_ledger"
  DROP CONSTRAINT IF EXISTS "tower_operations_ledger_event_type_check";
ALTER TABLE "tower_operations_ledger"
  ADD CONSTRAINT "tower_operations_ledger_event_type_check"
  CHECK ("event_type" in ('opening_capital', 'company_revenue', 'bill_payment', 'shop_capital_transfer'));
