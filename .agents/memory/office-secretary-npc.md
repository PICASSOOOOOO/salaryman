---
name: Office secretary NPC
description: Every pixel-office has a built-in stationary front-desk Secretary NPC; how it stays alive and put.
---

# Office front-desk Secretary NPC

Every pixel-office (interview-helper `pixel-office/`) spawns a built-in **Secretary**
greeter — an NPC, NOT a paid pixel-agent, present regardless of PRIME/tier/roster.

**Rule:** the secretary uses a reserved character id (`SECRETARY_ID` in `constants.ts`,
a large negative far below the sub-agent range which decrements from -1) and an
`isSecretary` flag on `Character`. It must be excluded everywhere the engine
iterates `os.characters` to despawn or re-drive NPCs.

**Why:** LiveOffice has two loops that will otherwise destroy/derail it —
(1) the roster-reconciliation despawn loop removes any character not in `agentList`,
(2) the live-activity sync loop toggles `isActive`/tool from the task feed. Both
already skip `playerId`; the secretary needs the same skip. Without it the secretary
is despawned on the next roster poll or yanked into wander behavior.

**How to apply:**
- Stationary behavior is enforced in `characters.ts updateCharacter` via an
  `isSecretary` short-circuit (mirrors the `isPlayer` one): TYPE animation only,
  clears path, never wanders/repaths/returns-to-seat. This is robust regardless of
  what other code does to `isActive`.
- Seatless on purpose so it never competes with real staff for a desk.
- Placement: nearest walkable tile to bottom-centre (the entrance), facing DOWN.
  Safe because pathfinding only blocks on furniture (`blockedTiles`), NOT on
  characters — a secretary standing on a walkable tile can't disconnect the floor.
- `addSubagent` explicitly skips `SECRETARY_ID` when decrementing, so the two id
  spaces can never collide.

**Not done (deliberate, deferred):** "make offices LARGE" and physical reception-desk
furniture. The base layout (`public/pixel-agents/assets/default-layout-1.json`, 21x22)
is NOT a clean walled rectangle (bottom row is an exterior doormat), so generic
procedural enlargement risks sealing the entrance / disconnecting the floor — do it as
a deliberate layout-artifact redesign, not ad-hoc padding. "Deckard bypass office
access" is N/A: Deckards are world-server entities that don't enter the client office
scene, and the secretary is a soft greeter (no hard movement gate) — nothing to bypass
until physical access gating is actually introduced.
