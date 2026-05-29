---
name: Poison gas + hazmat escort system (SALARYMAN world)
description: How the world-wide poison fog, exposure damage, and escort fast-travel are wired in WorldPlay.tsx
---

# Poison gas is decoupled from the combat/mutant `poisoned` status
The world-wide poison fog uses its OWN state (`g.gasPoison`, `g.gasExposureTick`)
and NEVER touches `g.poisoned`/`g.poisonTick`.

**Why:** the first cut reused `g.poisoned` for the gas tint + damage; architect
review caught that re-entering a safe zone then unconditionally cleared
`g.poisoned`, curing unrelated combat/item poison, and that gas extended other
poison sources. The fog overlay is the visual cue, so the sprite tint isn't
needed for gas.
**How to apply:** keep gas damage on `gasExposureTick` alone; don't merge it back
into the shared poison status. If you ever need gas-specific player tint, drive it
off `g.gasPoison`, not `g.poisoned`.

# Safe zones = locked city core (+ margin) OR a radius bubble around the player's home base
`gasSafeZone()` (module scope near the world constants) keeps home-spawned
players safe at spawn (large `GAS_SAFE_RADIUS` bubble around their
`hamletBuildingId` building) and keeps the Picasso city core safe. Going beyond
needs a `gasmask` (in `g.ownedItems`) or the escort.

# Escort = safe fast-travel; any damage path must be frozen while its modal is open
The escort modal (`escortPrompt`) teleports to city/home via `doEscort`. It is in
the `frozenRef` expression, and ALL poison damage (legacy `poisoned` tick AND gas
exposure) is gated on `!frozenRef.current` so the player can't die while choosing.
**Why:** architect flagged that the legacy poison tick was only gated on
`gamePausedRef`, not `frozenRef`, so a poisoned player could die mid-decision.
