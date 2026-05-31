---
name: World overview map (WorldMapPanel)
description: Which surface is the "world overview" map, why it looked like a strip, and how its artwork now encodes the poison-fog lore.
---

# World overview / OVERWATCH map

- The "world overview" / "WORLD OVERVIEW" (boomer) / "OVERWATCH" map is `pages/WorldMapPanel.tsx`, lazy-rendered inside `Profile.tsx` at route `/profile/world-map`. It is NOT `BurnedPaperMap` (the surveyor's chart at `/game/map`) and NOT the in-world canvas minimap in WorldPlay.
- **Why it read as "a strip":** the only drawn terrain was the city box = `DOWNTOWN_BOUNDS` (1680×800, a wide thin rectangle) floating in black, plus fake faction-territory rects (rust_syndicate/void_runners/etc.) that contradict the actual lore. The viewBox was also non-square (height = range×1.4).

## How the art now works
- It's a stylized **overview**, not a collision map. Geometry comes from module consts: `CITY_CX/CITY_CY` (center of DOWNTOWN_BOUNDS), `GAS_INNER`/`GAS_OUTER` (the dense fog annulus), `LAND_RADIUS` (the continent reaches this far before the void vignette).
- Lore it must express (from WorldPlay): the ENTIRE land is drowned in lethal fog; only the city core + home bubbles are safe; fog lifts over the in-game year. So the fog must read **global** (whole-land `fogAll` haze from the safe boundary outward) with the dense ring as emphasis — a ring-only hazard is wrong.
- SVG gradients use `gradientUnits="userSpaceOnUse"` with world-coord cx/cy/r so they line up with the land circle.

**Why:** rotating a rotationally-symmetric circle + radial gradient via `animateTransform` is a no-op (dead animation cost, worse under blur) — don't add motion that way; use a pulsing opacity or an asymmetric mask instead.

**How to apply:** edit the SVG artwork block + the geometry consts at the top of WorldMapPanel; the players/districts/landmarks/plots overlays render on TOP of the background layers, so keep new art before them in document order.
