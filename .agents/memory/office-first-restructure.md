---
name: Office-first restructure + city story-gate soft-lock
description: How SALARYMAN's office-sim-first navigation is wired, and why you must NOT naively hard-lock the city behind story.active.
---

# Office-first navigation

- Onboarded/cleared users land in **/office** (PabloOffice), not the old Home dashboard. `HomeOrCover` in App.tsx redirects cleared users to `/office`; Immigration finishes to `/office`. The Home dashboard is effectively retired as a landing surface.
- **/game (GameHub) is the TERMINAL** — the office computer's "OS". Title is "TERMINAL". Pablo is one tile in it (→/pablo), not a separate front door once signed in. Reach it from the office computer station (`onEnterTerminal` → `/game`). Logged-out `/pablo` stays the marketing/sign-in front door.
- Dead-end back-links removed/redirected: GameHub "Back to Pablo" → "Back to Office" (`/office`); Bank "Back to Game" → "Back to Terminal"; WorldMenu "← BACK TO SAVE FILES" removed.

# The city story-gate soft-lock (critical)

The owner wants the city (`/world`, `/world/play`) reachable **only when `story.active`**. But do NOT just gate those routes.

**Why:** the story is *begun inside the city* — WorldPlay shows a "→ MAKE CONTACT — BEGIN STORY" button only when you walk up to the in-city STORY_TRIGGER. There is no office/Pablo path to begin the story. Hard-locking `/world` behind `story.active` therefore traps every player: they can't enter the city to reach the trigger that would set `story.active`.

**How to apply:** before any city hard-lock, FIRST add an office-side "Begin Story" entry (owner's vision: visit Pablo on the office top floor via a working elevator — part of the larger office expansion: bigger floor, dept/bot-charging separation, hi-res art, full-immersion zoom). Only once that begin-story path exists is it safe to gate `/world` + `/world/play` on `story.active`. Owner explicitly ranks office-sim stability/immersion ABOVE the story trigger, so sequence accordingly.

`story.active` lives on the save blob (`data.story.active`); WorldPlay seeds it synchronously from the local save snapshot. GameLock is currently a passthrough (city open to all) by design — don't re-gate it without the begin-story path.
