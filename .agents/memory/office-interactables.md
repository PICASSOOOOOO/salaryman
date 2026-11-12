---
name: Office interactables + camera zoom-lock
description: How /office walk-up stations, the zoom-locked camera, and footstep audio work in PixelOffice/PabloOffice.
---

# Office interactables, camera & footsteps

The live `/office` (PabloOffice → PixelOffice) is a real walkable workspace whose
objects are **portals to EXISTING features**, never new features.

## Stations (walk-up portals)
- `PixelOffice` takes optional `stations?: OfficeStation[]` + `frozen?: boolean`
  (default `[]`/`false`, so cutscene/diorama callers are unchanged).
- The playable movement loop picks the nearest station within its `radius`; the
  built-in desk **computer wins precedence** over stations for both E/Enter and
  the prompt. Live values come from refs (`stationsRef`/`activeStationRef`) to
  avoid stale closures in the rAF + key handlers.
- Each station maps to a real route (classroom, /comms, /vending, /creative/lab,
  /creative/music, /business/documents). Reuse real furniture PNGs under
  `${BASE}pixel-agents/furniture/<DIR>/<FILE>.png` where they exist; fall back to
  inline-SVG glyph sprites (OfficeStationSprite) for objects with no art.

## Arcade = reuse, not rebuild
- ARCADE opens the existing `<ArcadeGame>` (ArcadeGames.tsx) as a lazy overlay,
  `frozen={!!arcadeGameId}` freezing the office underneath, `onDeductFiat=()=>true`
  for free play.
- **Gotcha:** valid `gameId`s are the GAME_LIST ids (`cyber_serpent`,
  `void_invaders`, `barrel_runner`, `neon_breaker`). An unknown id (e.g. the
  WorldPlay-style `'galaga'`) silently falls back to GAME_LIST[0] — pass a real id.

## Camera zoom (discrete levels)
- The **scale is chosen in PabloOffice** and passed to PixelOffice; PixelOffice
  centers the whole floor when scale is small enough that it fits the viewport
  (`hasCam=false`), else it pans/clamps a camera.
- Camera is a CYCLING fixed-level control, NOT free scroll/zoom and NOT a
  FOCUS/WIDE boolean (the old `wideView` flag is gone). Persisted enum
  `cameraZoom` in localStorage `salaryman.office.zoom`:
  - NEAR = follow/zoom-IN (you walk the floor, can't see it all),
  - MID  = fixed step out,
  - FAR  = fit the whole 45×11-tile floor, no scroll.
  Surveillance/CCTV mode forces FAR. Button label `⤢ ZOOM: NEAR/MID/FAR`.
- **Why the fit math must allow sub-1 scale:** clamping fit scale with
  `Math.max(1, …)` makes narrow (phone) viewports overflow so the camera clamp
  hides the floor edges — defeating "see the whole office". Floor at a tiny
  positive value (e.g. 0.2), not 1.

## Footsteps / stealth cue
- Subtle footstep = `sfxStep(vol, freq)` called in the movement loop on **every
  other** walk-frame advance, only while actually moving. `sfxStep` already
  respects sfx mute/volume and is quiet (0.06 base gain). Don't emit while idle
  or `frozen`.
