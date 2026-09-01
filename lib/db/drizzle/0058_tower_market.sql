CREATE TABLE IF NOT EXISTS "tower_market_holdings" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(64) NOT NULL,
  "company_key" varchar(80) NOT NULL,
  "shares" integer NOT NULL DEFAULT 0,
  "average_cost_fiat" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tower_market_holdings_shares_check" CHECK ("shares" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_market_holdings_user_company_unique" ON "tower_market_holdings" ("user_id", "company_key");
CREATE INDEX IF NOT EXISTS "tower_market_holdings_company_idx" ON "tower_market_holdings" ("company_key");

CREATE TABLE IF NOT EXISTS "tower_market_trades" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(64) NOT NULL,
  "company_key" varchar(80) NOT NULL,
  "ticker" varchar(8) NOT NULL,
  "side" varchar(8) NOT NULL,
  "shares" integer NOT NULL,
  "price_fiat" integer NOT NULL,
  "total_fiat" integer NOT NULL,
  "request_id" varchar(80) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tower_market_trades_side_check" CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "tower_market_trades_shares_check" CHECK ("shares" > 0),
  CONSTRAINT "tower_market_trades_price_check" CHECK ("price_fiat" > 0 AND "total_fiat" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "tower_market_trades_user_request_unique" ON "tower_market_trades" ("user_id", "request_id");
CREATE INDEX IF NOT EXISTS "tower_market_trades_company_created_idx" ON "tower_market_trades" ("company_key", "created_at");
CREATE INDEX IF NOT EXISTS "tower_market_trades_user_created_idx" ON "tower_market_trades" ("user_id", "created_at");