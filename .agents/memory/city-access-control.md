---
name: City / game access control (SALARYMAN)
description: Who may enter the locked city/game and how the GameLock gate is composed
---

# City access lock

The game/city (routes gated by `GameLock` in `artifacts/interview-helper/src/App.tsx`)
is locked to **Picasso org + approved alpha testers only**. Everyone else gets the
locked screen ("poisonous gas blankets the city...").

- Gate condition: `isOwner || isApprovedTester || isApprovedDev`.
- **Why `isOwner` is correct for "Picasso":** in this project `isOwner` (from
  `usePlan()`, backed by api-server `lib/plan.ts`) already *is* the Picasso set —
  Picasso org members and the hardcoded/env owner emails are the Picasso team, and
  testers also get owner bypass server-side. So `isOwner` == "Picasso + already-bypassed",
  not some broader public set. Do not "narrow" it to a separate org flag unless the
  product definition of owner changes.

# Loading-race rule for authz hooks feeding the gate

Any auth hook whose `loading`/data feeds `GameLock` must set `loading=true` at the
**start of every (re)fetch**, including auth transitions — not just initial mount.
`useAlpha` previously only set loading on mount; on a false→true auth transition it
briefly reported `loading=false` with stale-empty data, flashing the locked screen at
an authorized tester. Fix: `setLoading(true)` before the fetch in `refresh()`.

**How to apply:** when wiring a new permission hook into a gate, verify it gates on a
true loading state across re-fetches, or authorized users will be momentarily denied.
