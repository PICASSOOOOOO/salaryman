---
name: World/proximity speech reliability
description: How world speech bubbles, the world chat log, and moderation fit together in WorldPlay/worldServer.
---

# World/proximity speech reliability

World speech travels TWO server paths per human utterance: the server's `chat`
case broadcasts BOTH `{type:'chat',room:'world'}` AND `{type:'proximity_chat'}`
city-wide (not range-limited — every player in the city receives both). Deckard
bots / NPCs send `proximity_chat` ONLY.

**Why this matters:** any client feature that consumes "world speech" must
decide which path it listens on, or it double-counts humans.

## Distance fall-off lives on the client
The server fan-out is intentionally city-wide (bubbles should be visible far
away). "Fall-off" is therefore purely visual: `drawSpeechBubble` takes an
`alpha` (applied via `ctx.globalAlpha`), and the peer call-site fades by world
distance from the local player plus a short pre-expiry fade. Do NOT add a server
range cap to "fix" fall-off — that would undo the deliberate see-far-bubbles
design.

## World chat log de-dupe is cross-path
The existing chat panel (`chatMsgs`, toggle `C`) is the world log. Humans land
in it via the `chat` path; bots/NPCs are fanned in from `proximity_chat`. Both
paths feed a single de-dupe ring `recentLogRef` (key `name\u0001text`, ~4s
window) so a human's chat+proximity pair logs once while proximity-only speakers
still log. **How to apply:** if you add a third speech source, push its key into
`recentLogRef` too, or it will double-log.

## Unread badge uses the REF, not state
`chatOpenRef.current` is authoritative (synced on every toggle); the WS
onmessage closure is stale-bound, so `chatOpen` state reads wrong there. Always
gate unread increments on `chatOpenRef.current`.

## Moderation is server-authoritative
`moderateText()` in worldServer masks a small blocklist (letter-stretch
tolerant, `\b`-anchored to avoid the Scunthorpe problem) and is applied once to
the shared `text` in the `chat` case, so world chat AND DMs are filtered before
fan-out. Bot lines are authored, so not filtered.
