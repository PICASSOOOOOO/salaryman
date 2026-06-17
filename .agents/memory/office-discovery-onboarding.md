---
name: Office discovery onboarding
description: How SALARYMAN's story starts naturally through office play (no BEGIN STORY button) + the office MISSION MENU.
---

The story is NOT started by a button anymore. The office (PabloOffice) teaches
mechanics by discovery and the run begins when the player steps into the ELEVATOR.

- State machine: `lib/office-discovery.ts` (pure, unit-tested). Per-slot local
  progress `{moved,interacted}` (key `salaryman.office.discovery.<slot>`). Step
  order: move → interact → (eligible ? depart : work) → done(story.active).
  Returns null while the server gate is still loading (no cue flash).
- The office surfaces ONE contextual cue at a time (testid `office-discovery-cue`,
  `data-step`), replacing the OLD static control-hint bar + upfront WELCOME modal
  (both removed). Surveillance/CCTV hint bar is kept (only shows in surveillance).
- IsoOffice fires `onMove` ONCE per mount on first key/tap movement (movedOnceRef
  guard) — that's the only signal for the "moved" step.
- Elevator station onInteract is the story trigger: active→/world/play,
  eligible→beginStory() (intent+navigate, server commit still happens in city),
  else→locked modal with a FIND WORK path. Reads `storyGateRef` (a ref) because
  the stations useMemo is built once.
- MISSION MENU (`components/office/MissionMenu.tsx`) lists the quarter's SCENES
  from `lib/story-assignments` with done/active/locked status. `isScenePlayable`:
  only the ACTIVE scene is playable; the reserved opener is playable pre-story
  (begins the run), others only once story is active.

**Why:** beginStory was only ever an intent+navigate; the real server commit is
the city's "MAKE CONTACT". Keeping that model means the office discovery flow just
needs to reach beginStory()/navigate — it never double-commits.
**How to apply:** to add a new discovery step or cue, edit office-discovery.ts +
its test only; the office page reads currentDiscoveryStep/discoveryCue. The story
GET endpoint (salaryman-saves.ts) already returns active/missionIndex/assignmentsCompleted.
