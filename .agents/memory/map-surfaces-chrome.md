---
name: Map surfaces share MapChrome
description: All three SALARYMAN map surfaces draw their visitor-pamphlet look from one shared module; how to keep them consistent.
---

The three map surfaces are unified as a "VISITOR MAP" tourist-pamphlet family (the old name "OVERWATCH" is retired):
- `WorldMapPanel.tsx` (/profile/world-map) — dark overview, canonical art.
- `BurnedPaperMap.tsx` (/game/map via `Game/Map.tsx`) — sepia paper variant.
- The in-world minimap canvas in `WorldPlay.tsx` — sky-blue circular variant.

**Rule:** the shared look lives in `src/components/MapChrome.tsx` — `LANDMARK_GUIDE` (emoji + tag + color keyed by `CORE_ANCHORS[number]['type']`), `CompassRose`, `PamphletBanner`. Landmark visuals are keyed by anchor `type`, not a separate mapping.

**Why:** previously each map hand-rolled its own marker colors/labels and a now-deleted `ANCHOR_TYPE_TO_LM` indirection, so they drifted apart. `LANDMARK_GUIDE` is a `Record<AnchorType, …>` so adding a new anchor type is a compile error until the guide covers it.

**How to apply:** when adding/changing a landmark category or the map art, edit `MapChrome.tsx` once; do not re-introduce per-map color/label literals. The map is reachable from the Pablo terminal nav, the in-world pause/top menu ("CITY MAP"), and the clickable minimap — all route to `/game/map`.
