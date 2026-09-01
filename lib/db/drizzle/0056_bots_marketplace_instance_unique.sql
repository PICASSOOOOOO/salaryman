-- A marketplace entitlement represents one durable agent instance per user.
-- Normalize historical duplicate instances before enforcing that invariant.
WITH duplicate_bots AS (
  SELECT id, first_value(id) OVER (
    PARTITION BY owner_id, marketplace_item_id ORDER BY id
  ) AS canonical_id
  FROM bots
  WHERE marketplace_item_id IS NOT NULL
)
UPDATE bot_subscriptions AS subscriptions
SET bot_id = duplicate_bots.canonical_id
FROM duplicate_bots
WHERE subscriptions.bot_id = duplicate_bots.id
  AND duplicate_bots.id <> duplicate_bots.canonical_id;

DELETE FROM shadow_tower_workstation_assignments
WHERE bot_id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY owner_id, marketplace_item_id ORDER BY id
    ) AS position
    FROM bots
    WHERE marketplace_item_id IS NOT NULL
  ) AS duplicate_bots
  WHERE position > 1
);

DELETE FROM bots
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY owner_id, marketplace_item_id ORDER BY id
    ) AS position
    FROM bots
    WHERE marketplace_item_id IS NOT NULL
  ) AS duplicate_bots
  WHERE position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "bots_owner_marketplace_item_idx"
  ON "bots" ("owner_id", "marketplace_item_id");