---
name: Visually verifying auth-gated SALARYMAN screens
description: How to screenshot/test the logged-in game/office/dashboard screens that normally bounce to /pablo.
---

# Screenshotting the logged-in screens

The plain `screenshot` tool can NOT see `/game`, `/office`, `/my-office`, `/dashboard` etc. — anonymous loads hit the new-user funnel gate and render `/pablo`. To actually SEE these on mobile:

Use the **testing skill** (`runTest`) with `testReplitAuth: true`:
1. `[OIDC]` configure next login claims, `[Browser]` click the sign-in button on `/pablo`.
2. **Set localStorage `salaryman_tutorial_done` = `"1"`** — this is the single flag the App.tsx funnel gate checks (`isTutorialDone()` in `lib/tutorial-progress.ts`, pure localStorage). Without it, authed-but-not-onboarded users bounce to `/immigration`.
3. Then navigate to the gated route. Use `defaultScreenWidth: 400` for a phone viewport.

**Why this matters:** it turns "I can't verify logged-in screens" into a real visual check. Used it to confirm `/game` (WorldPlay HUD) is actually CLEAN on mobile — no collisions — so blind HUD surgery there is unwarranted.

# Gotchas found
- `/phone` is **plan-gated** (`PhoneGate` in App.tsx), so a free test user bounces to `/`. The PhoneDialer is reachable for free users only via the in-game compact phone (inside WorldPlay), not the standalone `/phone` page.
- A **Pablo Prime ad/upsell modal** renders app-wide (e.g. on `/` and over `/office` on first load) and dominates the mobile viewport by design — it has a close path (paywall-escape rule). Don't mistake it for a layout bug.
- **Office-first deep-link bounce:** even WITH `salaryman_tutorial_done=1`, a *fresh* load (`page.goto`) of ANY route (`/game`, `/store/realty`, …) bounces a cleared authed user to `/office`. Cause: `HomeOrCover` is an always-mounted keep-alive panel in App.tsx with NO pathname guard — it returns `<Redirect to="/office">` for cleared users and fires on every fresh mount, overriding the matched route. Cleared users reach other pages only via in-app (client-side) navigation. **To screenshot a non-office route, navigate client-side, not via `page.goto`:** run JS `history.pushState({},"","/store/realty"); window.dispatchEvent(new PopStateEvent("popstate"))` so wouter picks it up without remounting HomeOrCover. Verified `/store/realty` (RealtyStore showroom) this way.
