---
name: SALARYMAN Story Mode foundation
description: How opt-in, server-authoritative, one-way Story Mode is wired and the gotchas that constrain extending it.
---

# Story Mode foundation (SALARYMAN)

Story state lives in the save blob jsonb at `data.story` (StoryState) — NO schema
migration. Server endpoints in `artifacts/api-server/src/routes/salaryman-saves.ts`:
`GET /salaryman/story/:slot`, one-way `POST /salaryman/story/:slot/begin`.
Client wiring in `artifacts/interview-helper/src/pages/WorldPlay.tsx`.

## One-way guarantee is enforced on the SAVE endpoint, not just begin
`begin` is idempotent (returns `alreadyActive` if `data.story.active`), but the real
threat is the normal `PUT /salaryman/saves/:slot` overwriting the WHOLE `data` blob
and clobbering `story.active` with a stale/concurrent client save (lost update).
**Rule:** the PUT handler reads the committed story and merges it back — once
`story.active` is true it can never downgrade; forward-progress fields
(quarter/chapter/missionIndex) still pass through, but `active`/`startedAt`/
`homeBase`/`mx75Granted` are pinned from the committed copy.
**Why:** any future field added to StoryState that must survive must be added to this
merge, or a stale save will silently drop it. Don't move the one-way logic into
`begin` only.

## Eligibility is server-derived, never a client flag
`computeStoryEligibility()` checks a real job (`employedAt`) OR a registered business
(save data businesses, worldBusinesses real/minx rows, active orgMembers). The
client pre-saves (now awaited) before `begin` so the server sees fresh state, but
eligibility mostly derives from world DB rows, not the save blob.

## Geometry / confinement
STORY_TRIGGER beacon (6960,6300) — deliberately off MANHOLES[0] (6800,6300) to avoid
E-handler conflict. STORY_HOME underground camp (6620,6520). STORY_CORRIDOR
(x6180,y5780,w1080,h1720) — both points inside; `inStoryCorridor()` gates the prompt.

## Known gap: camp is a campsite, not a building
On begin: player teleports to camp, gas-safe-zone center overrides to
`story.homeBase`, map draws a camp marker. BUT respawn/spawn paths key off
`g.hamletBuildingId` (a building id) — indoor-start cinematic (~6939), mobile spawn
(~9543), load spawn (~6151). The camp has no building/interior, so post-passout/
respawn still sends the player to the legacy home. Migrating the canonical home
anchor to the camp needs a decision on camp interior vs open-world spawn (deferred
to follow-up; mission content).
