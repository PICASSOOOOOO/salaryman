---
name: Multi-city world isolation
description: Rules for keeping SALARYMAN's multiple cities (Minx, Huda) isolated within ONE deployment.
---

# Multi-city world isolation

Multiple cities (Minx, Huda, …) live in ONE deployment and SHARE the same world
coordinate space and the same building IDs (Huda reuses Minx geometry; cities
differ only by skin: color-grade theme, weather bias, name, confining walls).
Active city is a module-level value (`setActiveCityId`/`getActiveCityId` in
`lib/city-defs.ts`); the renderer/collision read `getActiveCityDef()`.

**Rule: every world WebSocket channel that a player can PERCEIVE must be
city-scoped, or cities leak into each other.** Server players carry `cityId`;
use `broadcastCity(cityId, msg, exclude?)` not the global `broadcast(...)` for
presence/movement/chat/speaking/world_time/pvp-announce, and gate direct
interactions (pvp_attack/pvp_projectile, voice proximity) on
`target.cityId === player.cityId`. `broadcastPlayerList` filters per-recipient.
Welcome `playerCount` must be the per-city count, never `players.size`.

**Why:** cities share one coordinate space, so two players at the same x/y in
different cities would otherwise see/attack/hear each other and the "different
part of the world" illusion (and the seam-hiding requirement) breaks.

**How to apply:** when adding ANY new world WS message that fans out to other
players, default to `broadcastCity(player.cityId, …)`; only use global
`broadcast` for genuinely world-global state.

**Building/floor ownership is PER-CITY (no longer shared).** Locks are keyed by
`${cityId}::${buildingId}` (and `…::${buildingId}:${floor}` for floors) via the
`lockKey`/`floorLockKey` helpers, so the SAME map spot can be owned by different
people in different cities — associates must pay/own separately in each city, and
each branch = each separate building. `getOwnershipStats(cityId)` filters by the
city prefix and STRIPS it, so the client still receives raw `buildingId`s (client
contract unchanged); the welcome payload likewise re-keys to raw ids. All three
lock fan-outs (`building_locked/unlocked`, `ownership_update`) are
`broadcastCity(player.cityId, …)`. `buildingLocks`/`floorLocks` are IN-MEMORY only
(no DB persistence), so this needed no data migration.

**`liberation_update` stays GLOBAL** even though it fires on a building claim —
liberation is world-wide progress, not per-city.

**Why:** locks were keyed by raw global `buildingId` (cities reuse geometry), so
claiming a spot in one city claimed it everywhere — breaking the per-city
ownership the user requires.

**Client→server handoff:** intercity travel writes `localStorage.city_travel`
`{cityId,x,y,at}` (60s freshness) right before navigating `/world/play`;
WorldPlay reads it at spawn, calls `setActiveCityId` before the loop, repositions
to the arrival hub, appends `&city=` to the WS connect URL, and persists
`cityId` on save. Mirrors the older `subway_destination` pattern.

**Minx must stay byte-identical:** default city skips the color-grade overlay,
and `getActiveCityDef().name` for the default == `CITY_NAME` ('MINX CITY'), so
label wiring (`CITY_NAME` → `getActiveCityDef().name`) is a no-op for Minx.
`getBusinessLocationLabel` keeps literal `'MINX'` behind a `=== DEFAULT_CITY_ID`
guard.

## Per-city capacity, intercity fare, home locker (follow-ups)

**Per-city capacity:** the world WS connection handler must parse `cityId`
FIRST, then count only players whose `cityId` matches the connecting city and
gate `cityPop >= MAX_PLAYERS` — never global `players.size`. Org soft-overflow
kept; `getServerStatus` stays global (admin/world view).
**Why:** MAX_PLAYERS is per-regional-city; one city filling must not lock others.

**Intercity fare:** charged SERVER-side in `routes/subway.ts`
(`INTERCITY_FARE_FIAT`, whole florins) via `spendEarnedFiat` (earned-ƒ only,
respects quarantine), 402 on insufficient. Client `Subway.tsx` mirrors the
const for DISPLAY only, shows a PAY/CANCEL confirm (decline path required),
charges FIRST and only runs the cutscene + localStorage `city_travel` handoff on
success. Do NOT mirror the intracity `/subway/travel` fareCents(×100) math —
that route is inflated; intercity works in whole florins.
**Known accepted limitation:** the fare debit has no idempotency token — for
in-game soft currency with one-click-per-trip UX this is acceptable; revisit
only if travel becomes a real-money or auto-retried flow.

**Home locker:** `player_storage` table (userId, slotIndex, itemId, quantity,
acquiredVia; unique userId+slotIndex+itemId), keyed by user+slot NOT city, so it
follows the player across cities. Deposit/withdraw atomically move the ownership
row between `player_inventory` and `player_storage` in one tx
(`delete().returning()` preserves acquiredVia). UI lives in the Armory inventory
tab. **Deposit MUST also delete any `player_loadout` row referencing the item in
the SAME tx** — the early "unequip first" check can be raced by a concurrent
equip, and a dangling loadout ref desyncs server-computed gear stats.

**Free-travel voucher:** `travel_vouchers` table (userId PK, balance, capped at
1 via `LEAST(balance+1,1)`) so a perpetually-full server can't be farmed. GRANT
happens on the `server_full` lobby path in `worldServer.ts` — only for
non-org-member arrivals who ARE legit business owners
(`worldBusinessesTable.businessType != 'unemployed'`); payload carries
`voucherGranted` (set TRUE only on confirmed DB write — grant returns bool).
CONSUME in `routes/subway.ts` POST `/subway/travel-intercity`: atomic
`UPDATE ... SET balance=balance-1 WHERE balance>0 RETURNING` BEFORE
`spendEarnedFiat`, returns `{voucher:true,vouchersLeft}` and waives fare. GET
`/subway/stations` reports `vouchers`. Client shows FREE/voucher modal copy
(keep Cancel decline path) + lobby note. **Seam-hiding:** never say "server
full" to the player — use floors/capacity lore (lobby = "ALL FLOORS OCCUPIED").
