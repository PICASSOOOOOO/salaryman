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

## Capacity is a real limit (be honest)
- Floor caps at ~6 desks + 8 capsules (`BULLPEN_DESK_SPOTS` / `CAPSULE_WALL_SPOTS`).
  The back wall (rows 0-1) fits only ONE capsule row, so ~8 horizontal is the ceiling.
  The deleted DOM dashboard was unlimited — extra bots truncate on the floor.

## Two width gotchas
- `bullpen` makes the room 33 tiles wide (16 private + 1 divider + 16 bullpen), so
  `PabloOffice.officeScale` must divide width by 33 cols, not 16, or the floor clips.

## Gotcha: can't screenshot it
- Only an authenticated owner gets bots (`/api/bots`). Logged-out preview hits the
  new-user funnel gate and shows `/pablo`, not the office (see newuser-funnel-gate.md).
  Verify via tests/typecheck, not a screenshot.
