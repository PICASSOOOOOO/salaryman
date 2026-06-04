---
name: New-user funnel gate (interview-helper)
description: Why logged-out / not-cleared users land on the /pablo nebula terminal on every route — App.tsx global gate, not a routing bug.
---

`AppShell` in `artifacts/interview-helper/src/App.tsx` has a GLOBAL GATE: any user whose tutorial is not done (`isTutorialDone()` false) is redirected for **every** path except a small whitelist (`/`, `/pablo`, `/immigration`, `/legal`, `/alpha`, `/auth`, `/api`):
- signed-out → `/pablo` (the Pablo nebula terminal — the door in; Pablo greets, collects name + email, hands off to `/api/login`).
- authed but not cleared → `/immigration` (the real intake; posts `POST /api/world/register`).

**Why:** The owner wants the app to OPEN directly on the Pablo nebula, like the original — no marketing/landing/explanation page. A bold art-forward `/landing` Cover page was tried and explicitly rejected ("it's ugly, delete that, should start with pablo nebula like before"). `Cover.tsx` was deleted and `/landing` fully removed.

**How to apply:** When screenshot-verifying a gated page (e.g. `/pledge`, `/bots`, `/world`) anonymously you'll see the Pablo nebula (purple orb + "ask anything"), not the page — expected, NOT a routing bug. Screenshots show the 2D fallback gradient, not the live WebGL orb. To truly verify gated pages you need an authenticated, tutorial-done session. New routes inside the `<Switch>` inherit this gate automatically. Do NOT re-introduce a `/landing` page as the funnel entry — the entry is `/pablo`. The redirect targets live in three App.tsx spots (HomeOrCover ×2, AppShell gate `navigate`) plus the unauth guard in `Immigration.tsx`; keep them in lockstep.
