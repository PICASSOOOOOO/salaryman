---
name: Office sim camera + tap-to-move
description: /office full-screen overhaul — camera follow/overview modes, mobile fixed-camera invariant, tap-to-move world mapping.
---

# /office (PabloOffice + PixelOffice) full-screen sim

- The live `/office` is `PabloOffice` rendering `<PixelOffice>` (NOT LiveOffice), full-screen
  (registered in App.tsx FULLSCREEN_ROUTES + GAME_ROUTES, so the global NavBar is hidden).
- Layout is a 100dvh flex column: compact fixed-height header, office pane `flex:1 minHeight:0`,
  and the ECONOMY ledger as a **collapsible BOTTOM drawer** (top/bottom split). `overflow:hidden`
  on the root → page never scrolls. viewport math: `officeAreaH = vh - HEADER_H - economyH`.

## Camera modes (localStorage `salaryman.office.zoom`)
- Two FIXED modes only: `follow` (~2.5×, locked on player) and `overview` (fit whole 45×11 floor).
  No free scroll-zoom. Surveillance always forces overview.
- PixelOffice has a `followCam?` prop; it follows the player only when `playable && followCam`.

## INVARIANT: mobile camera must be fixed
- **Rule:** on touch devices `followCam` must be `false` (camera fixed), AND the default zoom is `overview`.
- **Why:** mobile uses tap-to-move; a follow-cam hides off-screen tap targets so you can't reach
  stations. Architect flagged a follow-cam-on-mobile build as failing requirement (7).
- **How to apply:** `followCam = !surveillance && cameraZoom==='follow' && !isTouch`; the cameraZoom
  initializer defaults touch devices to `overview` (only when no stored pref exists).

## Tap-to-move world mapping
- The D-pad was removed. `handleFloorPointer` (on the PixelOffice container) maps a pointer to a
  world target: `world = (clientPos - rect + camRef) / scaleRef`, clamped to the same movement
  bounds the rAF loop uses; the loop walks toward `tapTargetRef` and key input cancels it.
- camXRef/camYRef/scaleRef are mirrored every render so the handler reads the live camera transform
  (the camera drifts in follow mode — must not use a stale snapshot).

## Hotkeys (desktop)
- Z = toggle camera, C = toggle LIVE/CCTV, H/? = help overlay, Esc = close overlay else → /game hub.
- Effect is suspended while the arcade overlay is open (`arcadeGameId`) and ignores INPUT/TEXTAREA.
- WASD/arrows/E are owned by PixelOffice and never overlap these.
