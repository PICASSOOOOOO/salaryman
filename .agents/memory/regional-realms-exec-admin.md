---
name: Regional realms + executive admin gating
description: How SALARYMAN runs identical per-continent realms and the correct auth gate for executives-only admin endpoints.
---

# Regional realms (identical per-continent servers)

- The SAME build runs as either realm; realm identity is env-driven in `worldServer.ts`:
  `SERVER_CITY_ID` (default `minx_city`), `SERVER_REGION` (default "AMERICAS — NORTH"),
  and the population cap `SERVER_MAX_PLAYERS ?? MAX_PLAYERS` (default 50, exported).
- Capacity check is at WS-connect BEFORE identity is known (name/company come as
  client-supplied query params); any business/employee PRIORITY must defer the gate
  until after server-side session/membership resolution, not trust the query params.
- Realms are SEPARATE deployments with SEPARATE databases → a business created on a realm
  inherently stays in that realm (region pinning is free). True cross-realm "visiting"
  needs shared cross-realm identity infra that does NOT exist yet.
- Realm catalog lives in `interview-helper/src/lib/world-servers.ts`: Minx City = NA (live),
  Huda City = Asia (live); cities carry `maxPlayers` + optional `serverUrl` (same-origin until
  each realm publishes its own domain). Categorize by continent.
- A separate realm = a separate Reserved-VM deployment with its OWN database and its own
  `SERVER_CITY_ID`/`SERVER_REGION` env. Deploy type (autoscale→Reserved VM) and publish
  geography are USER-SELECTED in the Publishing UI — NOT settable in code/artifact.toml.

# Executives-only admin gate — use requirePicassoStaff, NOT requirePicassoAdmin

**Rule:** Endpoints meant for Picasso *executives only* (e.g. `/api/admin/costs`,
`/api/admin/servers`) must gate with `requirePicassoStaff` (→ `isPicassoOrgMemberEmail`),
never `requirePicassoAdmin`.

**Why:** `requirePicassoAdmin` → `isOwnerEmail`, which ALSO includes the broader tester
allowlist. So "admin" routes are reachable by testers. For exec-scoped data (real-dollar
cost per user, server population) that is too broad.

**How to apply:** When a new admin route exposes sensitive business/infra data, pick the
guard by audience: tester-visible internal tooling → `requirePicassoAdmin`; executive/staff
only → `requirePicassoStaff`. The frontend tab can stay visible to all admins; the server
403 enforces scope and the CostsTab surfaces it as an error.
