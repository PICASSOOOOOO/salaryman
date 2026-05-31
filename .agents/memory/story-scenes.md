---
name: Story Mode "Scenes" + Scene 1
description: Durable decisions behind SALARYMAN story "SCENES" and Scene 1's escape/claim structure
---

# Story "Scenes" + Scene 1 "AND IT ALL FALLS DOWN"

Story Mode missions are presented to the player as **SCENES**. Scene 1 id is `and_it_all_falls_down`.

## Decision: device grant + home relocation belong to the CLAIM beat, not contact
The MX-75 grant and home-base relocation happen only when the player physically reaches the UNDERGROUND CAMP and claims the terminal — **not** when they make contact at the beacon.
**Why:** Scene 1 is an intro-to-the-outside-world escape; arriving at camp is the reward moment. Contact only commits the story and kicks off the collapse cinematic.
**How to apply:** keep `beginStory` free of device/teleport side effects; the server begin endpoint stays unchanged. Any new scene that hands out a reward should tie it to the in-world arrival, not the trigger.

## Decision: scene runtime state is ephemeral; only mission progress persists
The per-run scene state (phase/alley flags/cinematic) lives in `gs.current` and is intentionally NOT in the save blob. Only `g.story.missionIndex` persists.
**Why:** a mid-scene reload should drop the player back into the playable escape, not replay a half-finished cinematic.
**How to apply:** resume logic keys off `story.active && missionIndex < 1`; never add scene-run fields to the save data expecting them to survive reload.

## Constraints worth remembering
- Input freeze applies to the intro/claim cinematics only; the ESCAPE phase must stay playable (don't gate movement on "scene in progress" broadly).
- The reward finalize must be idempotent — a double click/key-repeat must not re-run it (it would lose the cached pre-scene zoom).
- Scene tight zoom intentionally exceeds `ISO_ZOOM_MAX`; the render path uses the unclamped zoom, only wheel/pinch clamp. Don't "fix" this as a bug.
