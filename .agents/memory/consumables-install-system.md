---
name: Consumables + install slots
description: How stackable consumables and installable target slots work in SALARYMAN items.
---

# Stackable consumables + installable slots

Two systems layered onto the existing one-time boolean gear/cosmetic ownership in
`artifacts/api-server/src/routes/items.ts` + `lib/item-catalog.ts`, persisted per
character save slot.

## Two ownership models share `player_inventory`
- **Boolean gear/cosmetics**: one row, quantity ignored, ownership = row exists.
- **Stackable consumables** (catalog `consumable: true`, types battery/fuel/material):
  same table, but `quantity` is authoritative. Stacking uses an upsert on the
  `(userId, slotIndex, itemId)` unique with `quantity = quantity + N`; never insert a
  second row. Decrement is a guarded `quantity >= N` update that deletes the row at 0.
- **Why:** keeps one inventory table + one buy route; the `consumable` flag is the only
  branch. Don't add a separate consumables table — the unique key already enforces one
  stack per item.

## Install slots
- `player_installed_items` (lib/db/src/schema/installed-items.ts) tracks
  `(targetType, targetId, slotNo, itemId)` per save slot. Capacity in `INSTALL_CAPACITY`
  (home:2, vehicle:1, bot:1, companion:1).
- **Ownership is server-resolved, never client-trusted**: `resolveInstallTargets()` is
  THE authority — homes from `data.story.homeBase` + `data.propertyDeeds`, companions
  from active dog/cat (targetId = name UPPERCASED), vehicles from owned catalog items
  with `type==='vehicle'`, bots from `botsTable.ownerId`. install validates the target is
  in this set (404 if not).
- install takes 1 from the stack + inserts an installed row atomically; uninstall deletes
  the row + returns 1 to the stack. `canInstallInto` gates by the item's `installTargets`.

## Out of scope (Director task — exact scope only)
No battery/gas/electricity/crafting gameplay loops, no real-money purchase of consumables
(FIAT-only catalog entries). `/items/consume` is a bare decrement primitive, nothing
consumes its effect yet.

**How to apply:** adding a consumable = one `consumable()` catalog entry with
`installTargets`. Adding an install target type = extend INSTALL_TARGET_TYPES +
INSTALL_CAPACITY + a branch in resolveInstallTargets. Tests live in
`__tests__/items.test.ts` (vehicle is the easiest target — just insert an inventory row).
