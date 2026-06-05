---
name: Realm onboarding, capacity & soft-overflow
description: How SALARYMAN assigns a home city at onboarding, shows per-realm capacity, and lets businesses exceed the cap — and the privacy rule for stored location.
---

# Realm onboarding, capacity & soft-overflow

Realms are **separate deployments with separate DBs** (NA = MINX CITY, Asia = HUDA CITY).
Each running deployment IS one realm; live cities are "the same world run per region",
not separate origins reachable from one server (their `serverUrl` is empty until that
realm is independently published).

**Home-city pick at onboarding is metadata, and that's correct — not fake.**
The `relocation` phase (between intake and stamping in Immigration.tsx) lets the player
FREE-pick any live city. The choice is stored in `worldBusinessesTable.meta` JSONB
(`homeCityId`, `locationConsent`, `coarseLocation`) — **no schema migration**. True
cross-realm visiting + multi-city org management only activate once a second realm is
its own deployment. **Communicate this; do not build speculative cross-origin WS routing.**

**Why:** the user explicitly chose free-pick + "keep management simple", and the
separate-DB architecture makes "office stays in region" inherent. Wiring cross-origin
WS routing now would be dead speculative infra.

**Capacity display:** `GET /world/population` returns `{cityId, region, online, max}` for
THIS realm only (online count lives per-deployment). The picker shows live `online/max`
for the current realm and `CAP n` for sibling realms — that asymmetry is the honest
signal of which realm you actually enter now.

**Soft overflow at WS connect:** at `players.size >= MAX_PLAYERS` (default 50), the
connection handler is async and only then resolves the session user + checks
`isActiveOrgMember` (org_members status='active'). Active owners/employees are admitted
ABOVE the cap; unaffiliated arrivals get `server_full`. Awaiting only at cap keeps the
hot path sync.

**Location privacy rule (HARD):** `POST /world/home-city` must store **country-level
only** and **server-derived** from the request IP (geoip-lite on `x-forwarded-for`/socket,
strip `::ffff:`). NEVER persist the client-supplied location string — the client value is
display-only. Declined consent stores nothing. `/world/locate` is read-only (never stored)
and returns null on unresolvable dev IPs so the client falls back to browser timezone.
**Why:** an earlier pass stored the client's `country/region` verbatim, violating the
country-only constraint and trusting client input.

## Capacity lobby (at-cap non-business players)

Non-business players turned away at cap are NOT dead-ended — they're held in a
**socket-less "capacity lobby"** (WaitingLobbyPanel, themed as a ground-floor lobby
with pay phones) and auto-admitted when a floor frees.

**Hard constraint that shaped this:** entering the in-game office does NOT drop the
world WS — a player in their office **still occupies a world slot**. So a real office
can never be the capacity-free waiting area; the lobby must hold NO socket. The lobby
is a pure client screen that polls `/world/population` and `window.location.reload()`s
to re-run the normal connect path when `online < max`.

**Honesty:** it's a race-to-reconnect, NOT a reserved/numbered queue — copy must say
"watching for an open floor", never "holding your spot" (the latter overclaims a queue
position that doesn't exist).

On `server_full` the client nulls `wsRef.current` so the generic `onclose`
auto-reconnect (which attaches NO handlers — latent zombie) never fires; the lobby poll
owns re-entry instead.

**Cross-realm train travel is NOT real yet** — one running world until a second realm is
its own deployment. Don't fake a "travel to your city" station trip; wire the
station/notification only once a sibling realm has a reachable origin.

