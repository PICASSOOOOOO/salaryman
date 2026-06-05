---
name: Office bot monitoring (in-floor)
description: where bot monitoring lives in /office, the capsule/awake rule, the engine that renders it, and why screenshots don't show it
---

# Office bot monitoring — in the walkable floor

Owner picked the IN-FLOOR approach over a DOM dashboard: bots physically lie in
cryo-capsules on the game floor and stand at desks when activated. The separate
DOM `mode=monitor` split-window dashboard (component `OfficeMonitor.tsx`) was
REMOVED — `/office` modes are back to LIVE / CCTV only.

## Where it renders (load-bearing)
- The LIVE engine is `components/PixelOffice.tsx` (NOT pixel-office/LiveOffice).
  It already had the desk+capsule system; it just needs to be fed.
- `PixelOffice` only draws bots when `bullpen` is true AND `activeBots`/`idleBots`
  props are passed. `PabloOffice` now enables `bullpen` and passes both, sourced
  from `/api/bots` (folded into its existing 30s `fetchAll` poll).
- **Why it showed nothing before:** PabloOffice rendered `<PixelOffice premium />`
  with no `bullpen` and no bots, so defaults (`bullpen=false`, `[]`) drew an empty
  private room. Don't "rebuild the engine" — wire the props.

## Activation / capsule rule
- A bot is AWAKE (stands at a desk) **only** when `status === 'active'`. Every other
  status (paused, error, unknown/null) sleeps in a capsule. Requirement: "all bots
  in sleep capsule positions unless activated."
- "Stand up when activated" = the bot relocates capsule→desk on the next poll;
  there is no walk animation (engine has no path-to-desk move).

## Where the logic lives (pure, unit-tested)
- `interview-helper/src/lib/office-monitor.ts` — KEPT and reused for floor ordering.
  `floorPlacement(bots) -> {deskBots, capsuleBots}` clusters each list by team
  (`groupByTeam`, team=`department`, skill=`permissions`) and tags each bot with
  `teamColor`/`teamLabel`. `PixelOffice` tints desk/capsule trim by `teamColor`.
- Edit + test the helper; `PixelOffice` is a thin renderer.

## Prop-driven sizing + camera (the floor is now BIG)
- `PixelOffice` is PROP-DRIVEN: `roomCols`(default 16), `roomRows`(default 7),
  `viewportWidth`, `viewportHeight`. ALL cutscene callers (PabloOnboarding,
  PostOnboardingIntro, OfficeStage, LiveOffice) pass NONE of these → defaults keep
  them byte-identical (small fixed diorama, no camera).
- `/office` (`PabloOffice`) passes `roomCols=22 roomRows=11` + a viewport. The room
  is far bigger than the viewport, so a CAMERA `<div data-testid="pixel-office-camera">`
  (translate(-camX,-camY)) pans the floor: follows the player when playable, parks on
  the bullpen centre in CCTV/non-playable. Clamped to [0, contentPx - viewPx] on both
  axes. `hasCam` is false (camX=camY=0) whenever no viewport is passed → diorama mode.
- **Overlay gotcha:** screen-space overlays (corner vignette, CRT scanlines, PRIVATE/
  BOT BULLPEN labels) live OUTSIDE the camera div so they stay locked to the viewport.
  World-anchored bits (computer-glow 💻 marker, room art) stay INSIDE and pan. The
  ENTER TERMINAL button + touch D-pad are also outside (viewport-fixed). If you add a
  new overlay, decide: world-anchored → inside camera; HUD/screen-space → outside.
- `doorTopRow=rows-3`, `doorBotRow=rows-1` drive BOTH the divider render and the
  movement doorway band — keep them in sync (one derived value, used in both).
- `officeScale` in PabloOffice is now a FIXED crisp scale (3 desktop / 2 phone via
  `vw<760`), NOT fit-to-width. The camera handles overflow, so don't reintroduce a
  divide-by-33-cols shrink — that was the OLD whole-floor-must-fit approach.

## Capacity on the big floor (be honest)
- Big floor caps at ~10 desks + 11 capsules (`makeBigDeskSpots` / `makeBigCapsuleSpots`,
  driven by `BIG_DESK_COLS`/`BIG_DESK_ROWS` and `BIG_ROOM_COLS`). Default 16x7 floor
  still caps at ~6 desks + 8 capsules (`BULLPEN_DESK_SPOTS`/`CAPSULE_WALL_SPOTS`).
  Extra bots beyond the spot count truncate on the floor.

## Future direction (NOT built)
- Owner wants VARIABLE room sizes + possibly multiple offices per floor via an
  ELEVATOR. The prop-driven sizing already enables "different sizes" (pass different
  roomCols/roomRows). Elevator/multi-office is a separate follow-up — not built.

## Gotcha: can't screenshot it
- Only an authenticated owner gets bots (`/api/bots`). Logged-out preview hits the
  new-user funnel gate and shows `/pablo`, not the office (see newuser-funnel-gate.md).
  Verify via tests/typecheck, not a screenshot.
