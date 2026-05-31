---
name: Armory gear / inventory system
description: How equipped-gear stats flow from server catalog into live combat, plus the buy/refund and nav gotchas behind the SALARYMAN Armory.
---

# Armory gear / inventory system

## Single source of truth for gear stats
- `computeGearStats(equippedItemIds)` in `artifacts/api-server/src/lib/item-catalog.ts` is THE resolver. `/api/items/loadout?slot=N` returns `{loadout, stats}`.
- The client must NOT recompute stats from item defs. WorldPlay loads the server's `stats` bundle into `gs.current.gearStats` and feeds it through the pure helpers in `combat-system.ts` (`gearAttackFlat`, `gearTechRangedFlat`, `gearMagicMultiplier`, `gearDefenseMultiplier`). Display and fight math consume the same numbers so they can never diverge.
- **Why:** the whole point of the task was "gear that REALLY changes combat" — any second computation path silently desyncs the stat card from the actual damage.

## Gear refresh signal
- Armory bumps `localStorage['sm_gear_rev']` on equip/unequip; WorldPlay listens for the `storage` event and re-fetches the loadout. The `storage` event does NOT fire in the same tab that wrote it — that's fine because Armory and WorldPlay are separate routes, and WorldPlay's mount effect always fetches fresh. Cross-tab is the only case the event covers.
- Active save slot = `localStorage['sm_slot']` (default 0); loadout/inventory are keyed per slot.

## Combat wiring sites in WorldPlay
- Outgoing: melee baseATK + the 3 ranged ATK sites (click ranged, auto-fire, and the no-interior ranged branch) all add the flat bonus inside the sum then multiply by `gearMagicMultiplier`.
- Incoming: 4 damage-intake sites (projectile, threat melee, debt enforcer, band enforcer) all multiply final damage by `gearDefenseMultiplier`. Each already had an `armorMult * defReduce` pattern — append the gear mult there.

## Balance constants (combat-system.ts)
- magic = +1%/pt outgoing (uncapped), defense = -0.6%/pt incoming **floored at 0.25 (max 75% reduction)**. The floor is what keeps a full legendary loadout from being invulnerable; don't remove it.

## Purchase integrity gotcha
- FIAT spend (`spendEarnedFiat`) and the inventory insert are NOT one transaction. `/items/buy` inserts with `onConflictDoNothing().returning()`; if returning is empty a concurrent purchase already granted it, so we MUST `refundFiat()` the duplicate spend or the player is charged twice. The Stripe `/items/checkout` path still lacks idempotency (webhook grant is idempotent so item is granted once, but double card charge is possible) — tracked as follow-up.
- `playerInventoryTable.id` is a **number** (serial), not a uuid string — type `.returning({id})` results accordingly.

## Nav gotcha
- `modules.ts` `getModuleForPath` uses index-based `MODULES[N]` references. ADD new modules at the END of the MODULES array so existing indices don't shift, then add a matching `if (pathname.startsWith('/x')) return MODULES[N]` line.
