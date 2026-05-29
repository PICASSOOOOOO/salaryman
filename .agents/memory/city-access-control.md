---
name: City / game access control (SALARYMAN)
description: Who may enter the city/game and how the GameLock gate is composed
---

# City access — now OPEN to all users

`GameLock` in `artifacts/interview-helper/src/App.tsx` is a **passthrough** — the
game/city is open to every user. It previously gated entry to the Picasso org +
approved alpha testers/devs during the art/OFFICE MODE rework; that restriction
was removed.

- If you ever re-lock the city, the gate condition was `isOwner || isApprovedTester
  || isApprovedDev` (`usePlan()` + `useAlpha()`), and `isOwner` already == the
  Picasso set (Picasso org members + hardcoded/env owner emails + server-side
  tester bypass). Do not narrow `isOwner` to a separate org flag unless the product
  definition of owner changes.

# `useAlpha` is NOT a game-access gate anymore

`useAlpha` / `isApprovedTester` / `isApprovedDev` still exist but only drive
bug-reporting + moderation UI (NavBar moderator badge, AlphaApply, FeedbackModal).
They no longer control who can enter the game.

# Loading-race rule for any authz hook feeding a gate (still applies if re-locked)

Any auth hook whose `loading`/data feeds a gate must set `loading=true` at the
**start of every (re)fetch**, including auth transitions — not just initial mount.
`useAlpha` once only set loading on mount; on a false→true auth transition it
briefly reported `loading=false` with stale-empty data, flashing the locked screen
at an authorized tester. Fix: `setLoading(true)` before the fetch in `refresh()`.

**How to apply:** when wiring a new permission hook into a gate, verify it gates on a
true loading state across re-fetches, or authorized users will be momentarily denied.
