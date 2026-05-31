---
name: World fresh-start reset
description: The admin "world" bulk-reset wipe that resets all players + deletes all orgs while keeping logins/billing.
---

The admin `POST /admin/bulk-reset` `target="world"` runs a single `db.transaction`
that `DELETE`s a curated FRESH_START_TABLES list (all game-progress + every org)
while preserving logins, billing, and catalog/seed tables.

**Rule:** when wiping `player_profiles`, also `UPDATE users SET active_profile_id = NULL`
in the same transaction.
**Why:** `derivePlayerName()` in world.ts fail-closes — if `users.active_profile_id`
points at a now-deleted profile row, it THROWS ("Active profile is missing…") and
every world endpoint that calls it 500s for previously-onboarded users.
**How to apply:** any reset/migration that removes profile rows must clear the pointer.

**Rule:** "wipe ALL game progress" must include the progression *ledgers*, not just
the live state — at minimum `business_transactions` and `business_snapshots`. These
key off bare `player_name` (no FK to world_businesses), so delete order is free.
**Why:** stale ledgers survive an incomplete wipe and contradict the fresh-start promise.
