---
name: New-user funnel gate (interview-helper)
description: Why logged-out / not-cleared users land on the bold /landing page on every route — App.tsx global gate, not a routing bug.
---

`AppShell` in `artifacts/interview-helper/src/App.tsx` has a GLOBAL GATE: any user whose tutorial is not done (`isTutorialDone()` false) is redirected for **every** path except a small whitelist (`/`, `/pablo`, `/immigration`, `/landing`, `/legal`, `/alpha`, `/auth`, `/api`):
- signed-out → `/landing` (the bold, art-forward Cover page; its "Play Free" button runs `/api/login`).
- authed but not cleared → `/immigration` (the real intake; posts `POST /api/world/register`).

**Why:** The front door for the masses is the bold `/landing` page, NOT the wordy `/pablo` text terminal. The terminal still exists as a route but is no longer the forced funnel entry (it was retired because the real onboarding is the Immigration flow). Keep the door plain and art-first.

**How to apply:** When screenshot-verifying a gated page (e.g. `/pledge`, `/bots`, `/world`) anonymously you'll see `/landing` (SALARYMAN hero, "Play Free"), not the page — expected, NOT a routing bug. To truly verify gated pages you need an authenticated, tutorial-done session. New routes inside the `<Switch>` inherit this gate automatically. If you re-introduce `/pablo` as the entry, also flip the three redirects in App.tsx (HomeOrCover ×2, AppShell gate) and the unauth redirect in `Immigration.tsx` back in lockstep.
