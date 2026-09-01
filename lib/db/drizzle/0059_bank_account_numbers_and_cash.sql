ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_number" varchar(32);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_account_number_unique"
  ON "bank_accounts" ("account_number");

-- Keep existing account balances, but stop presenting the old automatic
-- checking/savings/vault seed as accounts the player opened.
UPDATE "bank_accounts" legacy
SET
  "kind" = 'cash',
  "label" = 'CASH WALLET',
  "balance" = totals.total_balance,
  "apy_bps" = 0,
  "account_number" = NULL
FROM (
  SELECT "user_id", MIN("id") AS "keep_id", SUM("balance") AS "total_balance"
  FROM "bank_accounts"
  WHERE "label" IN ('STANDARD CHECKING', 'HIGH-YIELD SAVINGS', 'GOLD VAULT')
  GROUP BY "user_id"
) totals
WHERE legacy."id" = totals."keep_id";

DELETE FROM "bank_accounts" legacy
USING (
  SELECT "user_id", MIN("id") AS "keep_id"
  FROM "bank_accounts"
  WHERE "label" IN ('STANDARD CHECKING', 'HIGH-YIELD SAVINGS', 'GOLD VAULT')
  GROUP BY "user_id"
) totals
WHERE legacy."user_id" = totals."user_id"
  AND legacy."id" <> totals."keep_id"
  AND legacy."label" IN ('STANDARD CHECKING', 'HIGH-YIELD SAVINGS', 'GOLD VAULT');