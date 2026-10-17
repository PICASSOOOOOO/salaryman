---
name: Browser office monitor and in-floor bots
description: The new browser-only supervisory monitor, privacy boundaries, and existing in-floor bot rendering rules.
---

# Office monitoring and in-floor bots

The owner later requested a detachable, browser-only, read-only office monitor,
overriding the earlier decision to remove the separate DOM monitor. It must not
expose game controls or the game HUD. It should show coworker avatars and their
physical office activity, be usable on mobile and desktop, and only show people
the viewer is authorized to see. Managers can monitor lower-level staff; lower
employees can see peers but not management. Enforce this on the server, not only
in the browser.

Keep the professional browser surface free of game-economy clutter. Credits and
USD payroll figures must remain clearly separate; per-minute salary activity is
real-time in browser and game clients. A terminal catalog is also desired:
department-focused terminals and more expensive all-in-one models, including an
automation terminal/section for hiring in-game bots or NPCs that operate across
browser and game experiences.

The existing in-floor bot rule remains: bots physically use desks and cryo
capsules in the game office; the browser monitor is a separate supervision
surface, not a replacement for those game characters.

The owner clarified that the game office and browser monitor must be an exact
live feed of the same state, not two simulations. Game movement/actions are
authoritative; the browser monitor subscribes read-only and mirrors those
updates, with role/privacy filtering applied before data reaches a viewer.

The live monitor should also promote the downloadable office simulation: browser-
only users can watch game-side activity, while the game remains the interactive
experience. Organizations may opt in to be featured on the game download page as
a live, Twitch-like feed; feeds should be shareable and suitable for broadcasting
on Twitch. Public promotion is opt-in at the organization level.

Public featured feeds should use anonymous avatars and movement, include game
sound effects and stereo music, and never expose sensitive messages or
conversations. The camera should automatically follow characters with the most
interaction, action, or fictional combat. SALARYMAN's office simulation is a free
game and the monitor is intended to help browser users discover it.

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
