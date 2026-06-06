---
name: Deckard always-live crew
description: Why the Deckard test-bot crew is persistent only in the home city, not every city.
---

# Deckard test-bot crew staffing rule

Deckard = server-authoritative "maintenance"/test bots (worldServer.ts `deckardTick`) that roam a
city so the live MMO is exercised with real networked presence/comms.

Rule: the **home city** (`SERVER_CITY_ID`) is ALWAYS staffed to `DECKARD_TARGET_MIN` and never
despawned — the crew stays live even with zero humans online. **Other** cities are staffed only
while a real human is present and despawn when empty.

**Why:** "always live" must NOT mean "staff every city forever." `cityId` comes straight from the
WS query (`params.get('city')`) with no allowlist, and bots themselves keep a cityId alive in the
`players` map. If non-home crews never despawned, a client could connect with arbitrary fake city
IDs and accumulate 3–5 persistent bots per fake city indefinitely (app-layer DoS), since the
260ms tick scans `players` per city every tick.

**How to apply:** keep the `keepStaffed = cityId === SERVER_CITY_ID || cityHumanCount(cityId) > 0`
gate. If you ever want more cities always-on, gate on a known-realm allowlist, not on raw
client-supplied city IDs. A real fix for the underlying input-validation gap is to constrain
`city` at connect time.
