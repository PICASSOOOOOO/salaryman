---
name: Office bot MONITOR mode
description: /office split-window bot dashboard — capsule/awake rules, where the logic lives, why screenshots don't show it
---

# Office bot MONITOR mode

`/office?mode=monitor` is the 3rd PabloOffice mode (LIVE / CCTV / MONITOR). It keeps
the playable PixelOffice canvas on top and renders a DOM dashboard below it (a
"split window" so the owner watches the crew while working). It is NOT a canvas
feature — the pixel engine still only supports walk/type/read/idle, no sleep pose.

## Activation / capsule rule (load-bearing)
- A bot is AWAKE ("AT WORK") **only** when `status === 'active'`. Every other status
  (paused, error, unknown/null) is a SLEEP CAPSULE.
- A faulted bot (`status === 'error'`) is STILL a capsule — fault is a secondary red
  badge, never a separate awake/working state.
- **Why:** requirement is "all bots in sleep capsule positions unless activated";
  a first pass rendered error bots as their own FAULT card and failed review.
- **How to apply:** drive the pod visual from `podState(bot)` → `working|fault|asleep`
  (only `working` is awake). Don't reintroduce a 4th awake-ish branch.

## Where the logic lives
- Pure, unit-tested: `interview-helper/src/lib/office-monitor.ts`
  (`isAwake`, `isFaulted`, `podState`, `partitionByActivation`, `groupByTeam`,
  team = `department`, skills = `permissions`). Edit + test here, the component is a
  thin renderer (`components/OfficeMonitor.tsx`).

## Gotcha: can't screenshot it
- The monitor floor only renders for an authenticated owner (fetches `/api/bots`).
  Logged-out preview screenshots hit the new-user funnel gate and show `/pablo`,
  not the office — see newuser-funnel-gate.md. Verify via tests/typecheck, not a
  screenshot.
