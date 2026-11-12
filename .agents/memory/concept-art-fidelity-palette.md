---
name: Concept-art fidelity = palette, not detail
description: Why "make SALARYMAN match its concept art" is a palette/style problem, and where the city cohesion lever lives.
---

# Concept-art fidelity is a live-renderer style gap, not a detail-count gap

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
plus an inconsistent palette. Full re-render / painted-art overlay is infeasible
and high-regression-risk (collision/camera/interaction all keyed to the geometry).

**Why:** The safest high-impact lever is the live renderer's material and dressing
layer. It can change the perceived artwork without moving gameplay geometry,
collision, camera timing, or interaction targets.

**How to apply:** The six building material buckets (`isLocked` + 5 `bHash`
ranges) and the terrain districts are the stable style levers. Current direction is
physical 1970s–1980s solar-punk: adobe, ceramic, oxidised teal, terracotta, shaded
clay, warm plaques, cloth banners, and rooftop solar collectors. Keep silhouettes
and interaction geometry unchanged. Avoid bringing back neon-noir treatments just
because they are visually easy.
Don't try to overlay the unused iso building art keys (building_office_iso etc.) onto
extruded buildings — judged messy/misaligned earlier.

**Ground/roads cohesion:** the city surface is chunk-cached
(`terrainChunkCache`) and invalidates on lighting changes, so ground-style edits show
without a separate cache-busting system. Keep Huda's city-aware road tint intact.
