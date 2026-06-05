---
name: Gameplay capture pipeline (headless bot)
description: How the weekly TikTok gameplay-capture bot reaches /world/play and the non-obvious gates/security it must satisfy
---

# Weekly gameplay capture (Playwright headless bot)

A headless Chromium bot screen-records REAL SALARYMAN gameplay for a weekly
vertical short (captions + music, NO AI narration). Capture engine, finishing
ffmpeg, delivery and cron all live in api-server lib/gameplay-capture.ts +
lib/weekly-tiktok.ts + routes/gameplay-tiktok.ts.

## Clearing the new-user funnel to land on /world/play
Priming `salaryman_tutorial_done` alone is NOT enough. The bot kept bouncing
`/world/play → /immigration → /`. Root cause: **Home is kept-alive (always
mounted, even on other routes)** and its intro effect auto-redirects EVERY route
once per session unless BOTH are set before app boot:
- `sessionStorage 'sm_intro_redirected' = '1'` (the once-per-session guard), AND
- `sm_save.pabloOnboardingDone = true` (otherwise the redirect target is
  `/immigration`, which then bounces back to `/`).

**Why:** Home's redirect is driven by a localStorage-derived `onboardingDone`,
not by tutorial state or a server/registry row. So a fully-registered bot still
reads as "not onboarded" and gets funneled.
**How to apply:** any automation that must land on a deep route has to satisfy
Home's intro redirect, not just AppShell's tutorial gate.

## esbuild __name init-script gotcha
Passing a FUNCTION to Playwright `addInitScript` makes tsx/esbuild inject a
`__name` keep-names helper that is undefined in the browser → throws before the
body runs. Ship a plain STRING via `addInitScript({ content })` and embed
payloads with `JSON.stringify(JSON.stringify(obj))`.

## Delivery security
Auto-post to TikTok must look up `social_connections` scoped to OWNER userIds
(`getPicassoAdminUserIds()` in lib/plan.ts) + provider/status, and FAIL CLOSED
if none. A provider/status-only query would post the clip to the first connected
stranger's account.
**Why:** social_connections has one row per (userId, provider); an unscoped
"first connected tiktok" pick is a broken access boundary.

## Temp-dir lifecycle
Each run makes `os.tmpdir()/salaryman-capture-*` holding webm/mp4/music/caption.
The final mp4 is streamed from disk by the owner preview route for the job TTL
(~30m), so DON'T delete right after delivery. Clean the whole workDir when the
job slot is released (TTL timeout); on capture failure captureGameplay cleans
its own workDir since no caller knows about it yet.

## In-app owner UI entry point
Owners can create/preview/download a reel on demand from SocialMediaManager
(/marketing/social) — an owner-only "GAMEPLAY REEL" tab gated by usePlan().isOwner.
It drives the same owner-only endpoints (POST /run, GET /status, GET /:id/file).
Frontend gating is additive UI only; requireOwner on the routes is the real authz.
Status polling runs only while the job is active (REEL_ACTIVE set) and the tab is open.
