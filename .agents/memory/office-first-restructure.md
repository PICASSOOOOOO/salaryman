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

**How to apply:** before any city hard-lock, FIRST add an office-side "Begin Story" entry. This is now IMPLEMENTED:
- `src/lib/story-gate.ts` — `story.active` helpers: `currentSlot()`, `readLocalStoryActive()` (reads `sm_save` `.story.active` or `.data.story.active`), begin-intent flag (`sm_story_begin_intent` sessionStorage; set/read/clear), `fetchServerStoryActive(slot)` → `GET /api/salaryman/story/:slot` → `boolean|null` (null = unauth/error → caller keeps optimistic/local decision).
- `StoryCityLock` (App.tsx) wraps `/world/play` + `/world/land` INSIDE GameLock. Opens **optimistically** on local-active OR begin-intent so the office→city hop never flashes a lock; server-`false` downgrades to a Redirect to `/office` UNLESS begin-intent is still set. Embed + auth-loading bypass the gate.
- PabloOffice surfaces a BEGIN STORY CTA (`office-begin-story`) when server `story` is inactive: eligible → `setStoryBeginIntent()` + navigate `/world/play` (the in-city "MAKE CONTACT — BEGIN STORY" button, WorldPlay `beginStory` ~L6475, is the SOLE server commitment via `POST .../begin`); ineligible → reason hint + FIND WORK (`office-find-work` → `/bots/jobs`). Office mount clears stale intent.

**Key design:** the office CTA only OPENS the gate optimistically and hops to the city — it does NOT itself commit `story.active`. Commitment stays the in-city MAKE CONTACT button. Erring toward access (intent keeps city open even if contact isn't made) is intentional to avoid soft-lock; returning to the office clears intent and re-applies confinement on the next city entry.

`GET /api/salaryman/story/:slot` returns `{ story, eligible, reason }` (401 unauth). Eligibility = has a job OR business (`computeStoryEligibility`), both achievable in-office, so a player is never permanently stuck.

`story.active` lives on the save blob (`data.story.active`); WorldPlay seeds it synchronously from the local save snapshot.

## Deep-route reload bounce (affects e2e tests)
HomeOrCover is ALWAYS mounted (keep-alive home div) and, for an authed + tutorial-done user, renders `<Redirect to="/office">`. So a FULL page reload / hard deep-link of any non-office route bounces cleared users to /office. Surfaces like /store/realty are only reachable via CLIENT-SIDE in-app `<Link>` clicks. For e2e: log in, set `salaryman_tutorial_done=1`, reload to land on /office, then click the office "TERMINAL »" link (href=/game) → Game Hub "REAL ESTATE" tile → /store/realty. Verify server persistence via a DB query on salaryman_saves.data->'home', not via reloading the page (reload bounces).
