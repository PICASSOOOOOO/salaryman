---
name: New-user funnel gate (interview-helper)
description: Why logged-out / not-cleared users see the Pablo page on every route — App.tsx global gate, not a routing bug.
---

`AppShell` in `artifacts/interview-helper/src/App.tsx` has a GLOBAL GATE: any user whose tutorial is not done (`isTutorialDone()` false) is redirected to `/pablo` (or `/immigration` if authed) for **every** path except a small whitelist (`/`, `/pablo`, `/immigration`, `/landing`, `/legal`, `/alpha`, `/auth`, `/api`).

**Why:** Pablo is "the only door in" — the intake funnel must collect intent before the rest of the app unlocks.

**How to apply:** When screenshot-verifying a gated page (e.g. `/pledge`, `/pledge/agents`, `/bots`, `/world`) you will see the Pablo landing ("Hey, I'm Pablo…") instead of the page, because the screenshot session is anonymous/uncleared. This is expected, NOT a routing bug. Don't chase it. To truly verify such pages you need an authenticated, tutorial-done session. New routes added inside the `<Switch>` inherit this gate automatically and need no extra wiring to be consistent with siblings like `/pledge`.
