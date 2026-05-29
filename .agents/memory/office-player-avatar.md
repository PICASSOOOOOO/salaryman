---
name: Office player avatar (pixel-office)
description: Why the user-controlled office avatar must be excluded from the NPC FSM and why the world must not rebuild on roster polls
---

The pixel-office "bridge" scene (LiveOffice + `office/engine`) drives both NPCs and the
user's avatar through the same `OfficeState`. Two structural traps caused "avatar resets
position / moves on its own":

## Player must be OUT of the NPC FSM
The avatar shares `updateCharacter`'s state machine with NPCs. Marking it
`seatId=null`, `isActive=false`, `wanderTimer=Infinity` at spawn is NOT enough: the
inactive WALK-completion branch re-arms `wanderTimer = randomRange(...)` after every
input-driven step, so the avatar starts auto-wandering once you move it.

**Rule:** the avatar carries `isPlayer=true` and `updateCharacter` short-circuits to a
dedicated input-only path (`updatePlayerCharacter`) — animate/advance an input-set path,
rest in IDLE, never wander/seat-return/type.
**Why:** any autonomous FSM branch will eventually fight or override the keyboard.

## Roster changes must NOT rebuild the world
The init effect creates `new OfficeState()` and respawns the player at the default spawn
tile. PabloOffice re-polls staff every ~30s → new `agents` prop → new `agentList`. If
`agentList` is in the init effect deps, the whole world rebuilds every poll and the avatar
teleports to spawn.

**Rule:** init effect deps are `[tier, playerId]` only (reads roster via `agentListRef`).
A separate reconcile effect (`[agentList, status, playerId]`) adds/removes NPCs via
`addAgent`/`removeAgent` without rebuilding or touching the player. `playerLabel` gets its
own light effect.
**How to apply:** anything that changes on a timer/poll cadence must never be a dep of the
world-init effect; reconcile it incrementally instead.

## removeAgent is deferred (matrix despawn)
`removeAgent` does NOT delete immediately — it sets `matrixEffect='despawn'` and frees the
seat; `update()` deletes ~0.3s later. So `characters.has(id)` stays true during despawn. If
an id re-joins the roster within that window, a naive `if (!has) addAgent` skips it and it
still gets deleted. Use `OfficeState.cancelDespawn(id)` (clears the effect, re-claims/finds
a seat) when a despawning char is wanted again.
