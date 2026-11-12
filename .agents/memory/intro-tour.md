---
name: Onboarding intro tour
description: Vertical Pablo-narrated arrival tour played before intake; how its baked footage is produced and served.
---

# Onboarding intro tour (SALARYMAN / interview-helper)

A 9:16 Pablo-narrated arrival tour plays ONCE at the very start of onboarding,
BEFORE the registry intake, for brand-new authed arrivals. Office + city footage
stars a Deckard; Pablo narrates LIVE via the established TTS path. Skippable;
never hard-blocks returning/seen players.

## Phase wiring
- `Immigration.tsx` has a `tour` phase. `initialPhase()` = `isTourSeen() ? 'intake' : 'tour'`.
- Completing/skipping calls `markTourSeen()` (tutorial-progress key `salaryman_tour_seen`, distinct from `salaryman_tutorial_done`) then → `intake`. So a refresh mid-onboarding never replays it.
- Reached at route `/immigration` (whitelisted for new users in App.tsx funnel).

## Footage = baked once, shared by everyone
- Clips are baked into object storage and recorded as `art_assets` rows keyed `tour_clip_office` / `tour_clip_city` (category `tour`, mediaType `video`, backend `capture`, url = `/objects/...` path). These keys are NOT in SALARYMAN_ART_KIT, so the art pipeline never tries to regenerate them.
- Pipeline `lib/intro-tour.ts` reuses `gameplay-capture` (extended with `scene: "city"|"office"` + `deckard`) and mirrors weekly-tiktok's ffmpeg finish (1080x1920, libx264, yuv420p, +faststart, silent anullsrc) + ObjectStorageService upload. Single global job.
- Capture targets `WEB_BASE_URL` (default `http://localhost:80`) `/office` vs `/world/play`.

## Routes (routes/intro-tour.ts)
- `POST /intro-tour/bake` + `GET /intro-tour/status` are OWNER-gated (isOwnerEmail). `GET /intro-tour/clip/:scene` is OPEN (just silent footage, needed during onboarding).
- Clip route: in-proc Buffer cache keyed by object path + single-Range (206) support — mobile Safari needs 206 to start `<video>` playback. 404 (not 500) when not baked.

## Client fallback (REQUIRED)
- `IntroTour.tsx` `<video src="/api/intro-tour/clip/:scene">` (ROOT-relative, matches Immigration.tsx's own `/api/...` fetches). On video error → painted `useArtAsset` scene (`scene_office` / `scene_lobby`). The live Pablo voice is the experience; footage is the backdrop.
- Audio unlock requires a user gesture → explicit "TAP TO BEGIN" gate before narration/playback.

**Why:** footage capture can fail in any env; the tour must always render + narrate. Verified working with both real baked footage AND fallback.
