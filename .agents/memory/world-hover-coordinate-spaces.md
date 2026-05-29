---
name: WorldPlay hover/cursor coordinate spaces
description: How to map the cursor to world/interior coords in WorldPlay.tsx, and why city hover must be per-frame.
---

WorldPlay.tsx has two distinct render coordinate spaces, and cursor->space mapping differs:

- CITY (outdoor): camera follows the player. Screen->world conversion used everywhere
  (aim, click, hover) is `worldX = screenBackingPx + g.cam.x` (NO divide by zoom, even
  though the draw applies `ctx.scale(zoom)`; this is the codebase's established convention
  and matches the shipped aim/click code). Because `g.cam` changes every frame, any cursor
  value cached at mousemove time DRIFTS under a stationary cursor.
  **Rule:** store the RAW cursor in canvas-backing pixels (camera-free) at mousemove, then
  recompute the world point PER FRAME in the render loop as `rawScreen + g.cam`. Caching the
  final world point at mousemove is a bug.

- INTERIOR: the floor is fit-to-screen via `iScale/iox/ioy` computed from canvas + floor
  size only — NOT the camera/player. So interior cursor->coords is static and can be
  written once at mousemove without drift. `interiorCoord = (screenBackingPx - iox) / iScale`.
  decorMode must also write the hover ref or hover goes stale while decorating.

**Why:** event-driven (mousemove-cached) city hover lags the moving camera and drifts under
a stationary cursor; per-frame recompute is required for correct hit-testing.

**How to apply:** any feature that hit-tests the cursor against world entities (hover reveal,
hover tooltips, click-to-select) must follow the city-per-frame / interior-static split above.
