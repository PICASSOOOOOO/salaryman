---
name: World building/place name labels
description: Why open-world buildings/places show NO floating name text and which labels are functional (kept)
---

# Open-world name labels: removed by design

In the city/world gameplay view, buildings and places are recognised by their
ART/silhouette, NOT by floating name text. All readable place/building NAME
labels were intentionally removed from the live world canvas.

**Why:** user-requested — names cluttered the world; they wanted recognition by
object art instead, keeping only small *functional* labels.

**Kept (functional, do NOT remove):** interaction prompts (`[E] ...`, `[P] PARK`),
exit/door markers, rent/tenant status on player buildings, the player's OWN
office label (the separate `milaLabelRef` in WorldPlay), NPC/peer/pet name tags,
status warnings (FIRE, HOSTILE, radiation), HUD/narration, minimap compass.

**Removed (place/building identity text), 4 surfaces:**
- WorldPlay static-building entrance nameplate (was via `cityBuildingLabel`, incl. CORP HQ marker) → now only abstract signage marks.
- `drawPlayerBuilding()` in `lib/city-buildings.ts` — building `displayLabel` + `ownerName` text.
- Parking-lot `sp.label` (e.g. "SHADOW DISTRICT LOT").
- Billboard `bb.label` place marker.

**How to apply:** `cityBuildingLabel` is still LIVE on the SVG overview map
(navigation aid — names kept there) and interior banners are a separate surface;
don't assume those are gone. If adding a new world object, do not render its
name in the world view — give it distinctive art + an `[E]` prompt instead.
