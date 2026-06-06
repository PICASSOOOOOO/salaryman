---
name: Per-city exterior differentiation
description: How to make SALARYMAN cities feel distinct without breaking shared world geometry.
---

All cities in SALARYMAN SHARE the same building footprints and road network (same coordinates). Moving/relocating a building cascades into NPC spawns, interiors, door locks, and proximity logic — so do NOT relocate buildings to differentiate cities.

Differentiate **visually only**:
- **Streets:** `drawRoad()` in `WorldPlay.tsx` branches on `getActiveCityId()` — per-city sidewalk/curb/lane-divider colors. (Huda = warm sandstone walks + jade lane lines vs default concrete/amber.)
- **Palette:** a per-city color-grade overlay already tints the whole scene differently per city.
- **Building labels / signage:** city-aware label helper, NOT a renamed building. `cityBuildingLabel(b)` / `towerNarrName()` remap PABLO's `pablo_tower` to "MYRIAD" in Huda only, applied at the world signage render, the world-map marker text, and the proximity narration. The building id stays `pablo_tower` everywhere.

**Why:** the world is one shared geometry reused per city; only the rendering layer is safe to vary.
**How to apply:** new per-city visual change → touch the render/label layer keyed by `getActiveCityId()`; never edit `BUILDINGS` coords or the road graph per-city. `getActiveCityId()` is a cheap module getter, fine to call per-frame inside `drawRoad`.
