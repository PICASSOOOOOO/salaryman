---
name: Deckard live-test bots
description: How the server-authoritative Deckard maintenance bots are modeled in worldServer, and the human-only-counter constraint that comes with it.
---

# Deckard live-test bots

Deckards are server-authoritative test agents that make the MMO exercisable over the
real network (presence, movement, proximity comms) instead of only in a sandbox. They
live as entries in worldServer's `players` Map **with no websocket** (`Player.ws` is
optional + an `isBot` flag). The manager keeps 3–5 per city while at least one human is
present and despawns them when the city empties; movement is random-walk broadcast via
the same `player_move` path real clients use, and speech via `proximity_chat`.

**Why server-authoritative (not client NPCs):** the entire point is to test the network.
A client-only NPC proves nothing about presence/broadcast/comms paths. Putting bots in
the shared `players` Map forces them through `player_list`/`player_move`/`proximity_chat`
exactly like humans.

**Hard constraint — bots must be excluded from human-only counters.** Once anything
non-human lives in the `players` Map, every admission/headcount path that should mean
"real people" must filter `!p.isBot`. Known sites: per-city `cityPop` capacity gate
(else bots eat `server_full` slots) and the welcome `playerCount`. Any NEW counter that
gates capacity or reports population must do the same, or bots silently lock humans out.

**Null-ws safety:** every `players`-loop ws access must be `p.ws?.…`; the one non-null
assertion is guarded by a readyState check immediately before it. Adding a new broadcast
helper means adding the same guard.

**Pair memory cleanup:** `deckardMet` (`${botId}|${otherId}`) is pruned both on bot
despawn AND on human `player_left` (keys containing the departing id), or it grows
unbounded in a city that never empties.

## Client side (proximity bubbles)
`proximity_chat` renders a dialog bubble above the speaker at ANY on-screen distance
(interior/shrouded peers already `continue` before the draw, so outdoor speech is the
visible default). World chat also rebroadcasts `proximity_chat` (no exclude) so a human's
own speech bubbles for everyone including themselves. The client `bubbles` Map is pruned
on `player_left` AND a frame-gated GC (every 120 frames) drops expired entries — render
only *checks* expiry, it does not delete, so a speaker who stays would otherwise leak.
