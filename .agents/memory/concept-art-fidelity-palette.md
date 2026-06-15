---
name: Concept-art fidelity = palette, not detail
description: Why "make SALARYMAN match its concept art" is a palette/style problem, and where the city cohesion lever lives.
---

# Concept-art fidelity is a palette/style gap, not a detail gap

The complaint "the game looks like a kid made it vs the painted Minx City concept
art" is NOT about missing detail. The rendered world is already heavily detailed
procedural art:
- `/office` (`components/PixelOffice.tsx`, NOT pixel-office/LiveOffice) already has a
  full cinematic grade — vignette, polished-floor sheen, drifting dust motes,
  ceiling highlight, glow pools, framed art, plants — from prior tasks.
- The `/world` city (`pages/WorldPlay.tsx`) buildings are full 2.5D iso cubes with
  roof/front/side faces, brick/concrete/glass material textures, lit windows, 8
  rooftop archetypes; Shadow Tower (`pablo_tower`) is an elaborate tiered neon
  supertall. NPCs have hair/clothing/accessories.

The real gulf vs the painted concept art is **procedural-vector style vs painted**
plus a **non-noir palette**. Full re-render / painted-art overlay is infeasible and
high-regression-risk (collision/camera/interaction all keyed to the geometry).

**Why:** The single highest-impact, zero-geometry-risk lever is colour. The generic
city building material picker (in the "Isometric building cube rendering" block of
WorldPlay's building loop) used earthy "generic town" tones — terracotta brick,
concrete grey, ochre plaster — that clash with the neon-noir onboarding/Pledge art.

**How to apply:** That material picker is 6 hash buckets (`isLocked` + 5 `bHash`
ranges) setting only `wallR/G/B`, `roofR/G/B`, `accentR/G/B`. All textures, windows,
awnings, archetypes DERIVE from these constants, so re-grading the constants alone
re-skins the whole city with zero geometry change. Re-graded to a cool jewel-toned
noir key (indigo / slate / teal / plum / cool-brutalist); kept `isLocked` warm rust
so the "seized" signal still reads. Amber night-lit windows pop against cool walls.
Roads are neutral grey asphalt (Minx) — fine; Huda has its own warm-tan road tint.
Don't try to overlay the unused iso building art keys (building_office_iso etc.) onto
extruded buildings — judged messy/misaligned earlier.

**Ground/roads cohesion pass (follow-up):** the city SURFACE was a separate warm
"daytime town" leftover and got the same treatment. Re-graded, colour-only, to the
cool noir key: the `inCity` branch of `getBiomeColor` (4 districts: downtown / neon
strip / industrial / old district) is now blue-dominant slate/indigo/teal/plum; the
`drawCityTerrain` street-tree canopies went grass-green→desaturated teal w/ cool
slate trunks; parking-lot asphalt went warm grey→cool slate. Roads keep neutral grey
asphalt but `drawRoad` now adds faint cyan/magenta wet-reflection streaks gated on a
`_night` factor `(0.55 - roadBr)/0.25` (roadBr = dayBright), so they only glow after
dusk. Terrain is chunk-cached (`terrainChunkCache`) and auto-invalidates on dayBright
change, so ground colour edits show up without extra cache busting. Huda still has its
own warm-tan road tint via `_isHuda` — don't clobber it.
