---
name: Story Mode "Scenes" + Scene 1
description: How SALARYMAN story missions became "SCENES" and how Scene 1's escape/claim flow is wired in WorldPlay.tsx
---

# Story "Scenes" + Scene 1 "AND IT ALL FALLS DOWN"

Story Mode missions are presented to the player as **SCENES** (see `STORY_SCENES` registry + `sceneLabel(idx)`). Scene 1 id is `and_it_all_falls_down`.

## The split that matters: device grant moved OFF beginStory
`beginStory` (server `/salaryman/story/:slot/begin` is unchanged) commits the story but **does NOT** grant the MX-75 device or teleport. It starts a cinematic: tightens zoom (caches prior into `g.sceneZoomPrev`), camera shake, opens the `intro` overlay.

The device grant + home-base relocation happen in **`sceneClaimFinalize`** — only when the player physically reaches the UNDERGROUND CAMP (`STORY_HOME`). That's the "claim" beat. It sets `g.hasDevice`/`deviceBroken`/durability, `g.story.missionIndex = max(_,1)`, snaps to `homeBase`, restores zoom, saves.

**Why:** the scene is an intro-to-the-outside-world escape; arriving at camp is the reward moment, not the beacon.

## State model
- `g.sceneRun` ({id, phase:'intro'|'escape'|'claim'|'done', startTime, alleyReached}) is **EPHEMERAL** — NOT in `buildSaveData`. Only `g.story.missionIndex` persists.
- Reload mid-scene → a mount `useEffect` resumes ESCAPE when `story.active && missionIndex<1 && !sceneRun` (re-tightens zoom). Intro cinematic is intentionally skipped on resume.
- `sceneCine` (reactive, phase 'intro'|'claim') drives the overlay; `!!sceneCine` is in `frozenRef` so intro/claim freeze input but ESCAPE (sceneCine null) is playable.

## Gotchas
- Escape detection lives in the main rAF loop (near the beacon proximity block). It flips `phase` escape→claim BEFORE `setSceneCine`, so the per-frame React setter only fires once. Alley narration is one-shot via `alleyReached`.
- `sceneClaimFinalize` has an idempotency guard (bail if phase==='done' or missionIndex>=1) so a double-click doesn't zero `sceneZoomPrev` and lose the restored zoom.
- Scene overlay render mirrors the hospital cinematic block; cinematic key handler auto-clicks `[data-scene-continue]` once all lines shown (sceneCine added to its listener cond + deps).
- The tight scene zoom (~5.6) intentionally exceeds `ISO_ZOOM_MAX` (4.0); render uses `zoomRef` unclamped, only wheel/pinch clamp.
