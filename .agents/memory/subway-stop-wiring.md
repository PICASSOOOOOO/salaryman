---
name: Adding a subway/metro stop (SALARYMAN WorldPlay)
description: A new subway stop is NOT one edit — it spans 2 files and ~5 wiring points, or it half-works (travel-to but no board-back, or invisible).
---

# Adding a subway/metro stop

A subway station is a real building, not just a fast-travel entry. Miss any wiring
point and it half-breaks (e.g. you can travel TO it but can't board back, or it
renders as default art instead of the poison shroud).

Wiring points, all required:
1. **worldInteriorData.ts** — `list.push({ id:'sub_*', x,y,w:40,h:40, label, bright,
   doors: mkDoorS(...) })` (the actual in-world entrance building) AND add the id to
   the interior-id map as `sub_*: '_subway'`.
2. **WorldPlay.tsx — interaction id list** (the `['sub_west',...].includes(bid)`
   branch) so proximity `[E]` opens the metro panel + sets subwayOrigin.
3. **WorldPlay.tsx — render shroud branch** (`if (b.id==='sub_west'||...)`) so the
   station draws as poison fog and `continue`s past default building art.
4. **WorldPlay.tsx — STATIONS array** (inside the `showSubway` render IIFE) = the
   fast-travel DESTINATION list with its own teleport x/y (DECOUPLED from the
   building coords) + a `deep` flag for UI accent.

**Why decoupled coords matter:** STATIONS x/y is where you SPAWN on arrival, the
building x/y is the physical entrance you walk to to re-board. Put the spawn within
walking distance of a station building or the player can't leave (blackout→hospital
is the only safety net).

**Gas safety:** city always-safe zone is x[5840,7760] y[5440,7160]. Stops outside it
land in fog. The "surface into poison briefly" mechanic = `g.subwayGrace` (frames),
set ~360 on transit completion, decremented + gating gas damage in the gas-exposure
block. Applies to all arrivals (harmless for in-zone surface stops).

Minimap subway line render is an abstract static approximation — it does NOT read
STATIONS, so new stops won't appear there. Cosmetic only.
