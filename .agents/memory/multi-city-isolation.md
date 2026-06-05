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

**Known shared-by-design exception:** building ownership/locks
(`building_locked/unlocked`, `ownership_update`, `getOwnershipStats`) are keyed
by raw `buildingId`, so they are SHARED across cities (same geometry = same
buildings). Left global on purpose for least-labor MVP. Making ownership
per-city requires keying locks by `${cityId}:${buildingId}` everywhere
(stats, liberation, persistence) — a real follow-up, not a quick fix.

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
