---
name: Staged battle scenes + safe streets
description: How SALARYMAN's staged battle mode and the retirement of open-world roaming combat are wired, and the invariants that keep them correct.
---

# Staged battle scenes + safe streets

Real fights happen ONLY inside staged battle scenes (`BattleArena.tsx`, a
self-contained lazy canvas+RAF sub-scene launched from WorldPlay via
`startBattle(descriptor)` / resolved by `handleBattleOutcome`). The open world is
a safe networking zone. `lib/battle-system.ts` is the pure model (archetypes,
descriptor/outcome types, `resolveEnemy`, `pickBattleTrack`, `makeSparDescriptor`).

## The `OPEN_WORLD_COMBAT_LETHAL` flag (WorldPlay.tsx, near gas constants)
A single `const` (currently `false`) retires roaming combat. "Retire roaming
combat" means gating BOTH directions, not just enemy→player:

- **Enemy→player** (defense-in-depth, all gated with `OPEN_WORLD_COMBAT_LETHAL &&`):
  aggro (`shouldAggro`), enemy projectile→player damage, threat melee land
  (`canLand`), windup commit, enemy ranged fire. PLUS a normalization that flips
  any lingering `HOSTILE` threat back to `PATROLLING` so none freeze mid-windup.
- **Player→threat** (gate is `OPEN_WORLD_COMBAT_LETHAL || ANIMAL_TYPES.has(t.type)`):
  player melee swing, player projectile, player bomb AOE, and the dog companion's
  auto-attack loop. Gating only enemy→player is INCOMPLETE — it leaves risk-free
  XP/bounty/loot farming, which a review will (correctly) reject.

**Why the `|| ANIMAL_TYPES.has(...)` exception:** animal kills drop FOOD, which
feeds the *kept* hunger/cold survival system. So animals stay huntable while
combatant threats (gangs/syndicates/guards) become inert. Don't drop this branch.

**Untouched on purpose:** gas/safe-zone, radiation, hunger/cold, debt/collections,
police/wanted enforcement (incl. police/band killing threats), bad-batch. Open-world
peer PvP projectile is also left alone (separate multiplayer system, out of scope).

## BattleArena outcome reporting
`reportOutcome()` must fire rewards / story progression EXACTLY once. The RAF loop
already `cancelAnimationFrame`+`return`s after calling it, but it also carries a
hard `reported` one-shot guard (`if (reported) return; reported = true;`) so render/
RAF timing can never double-grant. Player base attack is snapshotted WITHOUT magic
mult; BattleArena applies `gearMagicMultiplier` once — don't double-apply.

## Verifying WorldPlay edits
Full `tsc --noEmit` on interview-helper is slow (~2 min, WorldPlay is ~24k lines)
and gets killed by the tool timeout when the dev workflows are running; detached
runs get reaped at the tool boundary. Fastest reliable check: `getLatestLspDiagnostics({filePath})`
— the IDE tsserver already has the project loaded and returns errors instantly.
