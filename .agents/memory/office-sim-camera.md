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

## Camera default = zoomed-in FOLLOW everywhere (incl. mobile)
- **Rule:** default zoom is `follow` on ALL devices, and `followCam = !surveillance && cameraZoom==='follow'`
  (follow-cam now tracks the player on touch too). The follow scale FILLS the viewport height
  (`scale = max(minZoom, viewportH/(11*16))`, minZoom 3 mobile / 2.5 desktop) so the 11-tile-tall
  floor never letterboxes — it reads as "almost first person" in-the-room gameplay.
- **Why:** the owner explicitly rejected the old mobile default (overview shrank the 45×11 floor to a
  thin strip in black, stations/terminal/comms invisible) and asked for a zoomed-in full-screen office.
  This REVERSES the earlier "mobile must be fixed-cam + overview" invariant — do NOT "restore" it.
- **Tap-to-move still reaches off-screen stations:** tap toward a screen edge, the player walks, the
  follow-cam reveals more floor; the prompt fires on proximity. (Old concern was you couldn't TAP an
  off-screen station — walking solves it.)
- **Full-screen fill:** viewport is driven by a ResizeObserver on the office pane (`officeViewRef`), not
  a `vh - chrome` estimate, and the root carries `env(safe-area-inset-*)` padding so the device status
  bar/notch/home-indicator never overlap the header or economy drawer.

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

## Enclosed executive offices (HQ rebuild)
- PixelOffice has a generalized `rooms?: OfficeRoom[]` prop ({id,x,y,w,h tiles; doorSide,
  doorAt,doorSpan; label,sub,accent,occupantSeed}). It builds a blocked-tile Set from each
  room's walls minus the door gap; the movement loop does per-axis tile collision so walls
  block and doors pass. Legacy callers that omit `rooms` are unchanged.
- `doorTopRow`/`doorBotRow` props override the central divider's open span. PabloOffice passes
  doorTopRow=11, doorBotRow=floorRows so the col-22 divider is SOLID rows 0-10 (keeps the bullpen
  split) but OPEN below → a lower-half corridor connects both wings across the whole exec wing.
- PabloOffice floor is now near-square and GROWS with the org: roomCols=22 (unchanged), roomRows
  = execLayout.floorRows (derived). Bullpen furniture/desks/capsules/stations stay hardcoded to
  the TOP (rows 0-8); the exec wing starts row 12. Player still spawns row 5 (bullpen), walks down.
- execLayout (useMemo in PabloOffice) returns {rooms, floorRows}: one office per ACTIVE org member
  from `/api/orgs/me` members[] (only populated for managers/owners — non-managers/empty roster →
  VACANT suites, by design; real per-member offices for everyone is Phase B/backend work). Offices
  lay out in banks of 6 (cols [1,8,15,24,31,38]) that WRAP into stacked rows (TOP=12, ROW_STRIDE=9,
  w=6 h=7, bottom door) so it is NOT a fixed-6 cap — soft cap 24 (4 rows). floorRows grows to fit.
  Nameplate label = title||role, sub = department; accent by role; occupant sprite seeded hash(userId).
- Phase B (deferred, communicated): in-game "add/claim executive office" build action +
  persistence; per-room interaction/portals. Phase A only renders + walls + nameplates.
