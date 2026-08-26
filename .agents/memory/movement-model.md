---
name: Character movement model (city vs office)
description: How player movement is integrated across the two roaming scenes and what must/must-not be delta-time scaled
---

The app has two roaming-avatar movement systems plus genre minigames:

- **pixel-office** (`src/pixel-office/office/engine/characters.ts`) — already delta-time based (`WALK_SPEED_PX_PER_SEC * dt`), tile-to-tile pathing.
- **city/interiors** (`src/pages/WorldPlay.tsx` `loop`) — was a fixed per-frame step (`SPD = 0.7` px/frame, no dt). Now delta-time normalized.
- **arcade minigames** (`src/pages/ArcadeGames.tsx`) — per-frame/tick steps, hand-tuned per genre; intentionally NOT unified.

**Rule:** WorldPlay city and interior locomotion share one continuous vector model: normalize digital input, preserve analog magnitude, approach the desired velocity with acceleration/braking, then multiply velocity by `dtFactor` before collision integration. `dtFactor = (now - lastFrameTs)/16.6667`, fallback 1, clamped `<= 2.5`, sampled every frame (even on hit-stop early-return) so it never spikes.

**Why:** fixed per-frame movement runs 2x+ too fast on 120/144Hz displays and crawls when the heavy loop dips below 60fps — that is the "movement isn't responsive / not consistent" complaint. dt makes 60Hz behavior identical while fixing the rest, and matches the office's existing dt model.

**Do NOT scale** (intentionally frame-based): the swing-lunge impulse (`swingLungeFrames`), NPC/AI `g.frame` timers, `tickCalendar(...,16.67)`, and the arcade minigames. Other WorldPlay player-position writes are teleports/spawns/transitions, not continuous locomotion.

**Collision rule:** integrate player deltas in bounded substeps and attempt the full diagonal before trying each blocked axis. This preserves corner/doorway sliding and prevents low-FPS or vehicle-speed tunneling through thin obstacles.
