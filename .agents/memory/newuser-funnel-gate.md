---
name: New-user funnel gate (interview-helper)
description: Why logged-out / not-cleared users land on the /pablo nebula terminal on every route — App.tsx global gate, not a routing bug.
---

`AppShell` in `artifacts/interview-helper/src/App.tsx` has a GLOBAL GATE: any user whose tutorial is not done (`isTutorialDone()` false) is redirected for **every protected path** except an allow-list that DIFFERS BY AUTH STATE:
- signed-out (anon) allow-list is DELIBERATELY NARROW: only `/`, `/pablo`, `/auth`, `/api`. The owner's rule: "no URL other than the front door (Pablo nebula) reachable by typing/deep-linking before sign-in" — Pablo is the firewall/bot filter. `/legal` + `/alpha` are NOT anon-reachable (they bounce to `/pablo`); only `/auth` + `/api` stay open because they ARE the sign-in machinery, not pages.
- authed-but-not-cleared allow-list adds `/immigration`, `/legal`, `/alpha`, and `/tower` (post-sign-in surfaces).
- both signed-out and signed-in visitors see Pablo at `/`; authenticated uncleared users enter `/tower` only through Pablo's explicit button or readiness handoff.

Two cold-load guards matter: (1) bounce only when `!isLoading` (isAuthenticated starts false, so acting mid-hydration mis-kicks a real authed user off /immigration|/legal); (2) `holdForAuth` early-returns `<CRTFallback/>` for any non-anon path while `isLoading` so a logged-out deep link can't FLASH the protected page before the bounce fires. Cleared users (tutorialDone) are never held/gated.

Pablo does the sign-in funnel NATURALLY (server prompt forbids "sign up for an account"; free CHATTING phase; only nudges login when user asks for a tool) — there are no explicit "how to sign in" instructions, by design. Don't add any.

**Why:** The owner wants the app to OPEN directly on the Pablo nebula, like the original — no marketing/landing/explanation page. A bold art-forward `/landing` Cover page was tried and explicitly rejected ("it's ugly, delete that, should start with pablo nebula like before"). `Cover.tsx` was deleted and `/landing` fully removed.

**How to apply:** When screenshot-verifying a gated page (e.g. `/pledge`, `/bots`, `/world`) anonymously you'll see the Pablo nebula (purple orb + "ask anything"), not the page — expected, NOT a routing bug. Screenshots show the 2D fallback gradient, not the live WebGL orb. To truly verify gated pages you need an authenticated, tutorial-done session. New routes inside the `<Switch>` inherit this gate automatically. Do NOT re-introduce a `/landing` page as the funnel entry — the entry is `/pablo`. The homepage itself always stays on Pablo; only the explicit Tower handoff leaves it.
