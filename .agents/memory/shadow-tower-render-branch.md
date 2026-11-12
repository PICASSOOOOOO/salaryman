---
name: Shadow Tower dedicated render branch
description: pablo_tower (and several other special buildings) skip the generic building draw path, so generic per-building rendering never affects them.
---

In WorldPlay.tsx's main `for (const b of BUILDINGS)` draw loop, several buildings
have dedicated early branches that draw custom art and then `continue` BEFORE the
generic building-cube renderer runs. Known special-cased ids: the metro stations
(`sub_*`), the save crystals, and most importantly `pablo_tower` (Shadow Tower —
an elaborate tiered cyberpunk supertall with plaza, halo, neon signage, antenna,
fog-warner NPC).

**Why it matters:** any generic per-building rendering logic you add (window grids,
extrusions, a `floors`-driven shaft, etc.) is DEAD CODE for these buildings — they
return via `continue` before reaching it. A generic "supertall shaft" gated on a
`floors` field looked correct and typechecked, but never executed for the only
building that had `floors` set, because pablo_tower draws itself and bails out.

**How to apply:** to change how Shadow Tower renders (height, windows, crown),
edit the dedicated `if (b.id === 'pablo_tower')` branch directly. Its overall
height is `rise = Math.max(300, floors>0 ? floors*4.4 : b.h*1.9)`, driven by the
optional `floors` field on the building def in worldInteriorData.ts (BDef). The
upward extrusion is occlusion-safe only because pablo_tower is the north-terminus
building, pushed FIRST into BUILDINGS, so it's drawn first with nothing behind it;
do NOT blindly give arbitrary mid-map buildings a tall `floors` shaft — the loop
paints in array order (not y-sorted), so a later-drawn building north of a tall
one would incorrectly paint over its shaft.
