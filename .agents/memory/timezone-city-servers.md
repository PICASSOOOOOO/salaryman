---
name: Timezone-based city servers
description: Design rule — cities are regional servers gated by timezone; route players to the nearest OPERATIONAL city, never a non-local one.
---

# Timezone-based city servers

Each city in SALARYMAN is a **regional server tied to a real-world timezone /
geography**, not a global space everyone shares.

- **Minx City = PST only.** A player in another region (e.g. owner is in
  Vietnam / ICT) must NOT be dropped into Minx City.
- Route every player to the **nearest city that is currently operational**.
  Today only ONE town exists (the 4-building proof town with poison + artwork),
  so "nearest operational" collapses to that one town for everyone — but the
  selection must be written as a real proximity/timezone resolution so it scales
  the moment more cities come online.

**Why:** Cities are meant to feel local/regional. The owner explicitly does not
want to be teleported across the world to a PST-only city just because it's the
only one built. This is a foundational world-design decision, not a one-off bug.

**How to apply:** When assigning/spawning a player into a city, resolve by
player timezone → match to a city's timezone → if that city isn't operational,
fall back to the geographically nearest operational city. Keep an explicit
`operational` flag and a `timezone`/region on each city definition. Expansion
to more cities only happens after the 4-building proof town (scale + poison +
expensive-looking artwork + floor-plan/schematic previews) is proven worthwhile.

# Pablo must NEVER call the game "Minx City"
SALARYMAN is BOTH the app and the game — that is the answer to "is this a video
game?". Minx City is just the PST timezone SERVER, one city among many. Every
other city is on LOCKDOWN for non-public reasons; **only Pablo knows why** and he
stays cryptic when pressed. The LIVE logged-in framing lives in
PABLO_SYSTEM_PROMPT section "THE VIRTUAL WORLD" (routes/chat.ts); the guest path
(PABLO_GATEKEEPER_PROMPT in routes/pablo-command.ts) already says don't lead with
Minx City. Fix chat.ts for the main assistant.
