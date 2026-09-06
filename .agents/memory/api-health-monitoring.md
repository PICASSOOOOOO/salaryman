---
name: API health monitoring (two-layer)
description: How full-platform API/connection health is monitored, alerted, and structure-tested in SALARYMAN.
---

# API health monitoring — two-layer model (mirrors phone-system)

Full-platform health uses the SAME two-layer pattern as the phone system: an
always-on in-process monitor PLUS an external script run as a Scheduled
Deployment. They are complementary — the external script is the only one that can
report a fully-down server.

## The two layers
- **In-process monitor** (`lib/connection-health-monitor.ts`): re-probes every few
  minutes while the server is up, debounces transitions, persists flips, emails on
  confirmed up/down. Wired in `index.ts` (delayed startup probe + interval).
- **External script** (`scripts/connection-health-check.ts`, `health:all`): hits
  the LIVE server from outside (default base URL = `https://salaryman.io`). Run as a
  Replit Scheduled Deployment (agent cannot create the cron — owner does it).

## Probes
`connection-probes.ts` `runAllProbes(baseUrl)` covers external integrations PLUS
the internal API: liveness (`/api/healthz`→200) and a structure/auth probe
(`probeInternalApiAuth` → an auth-enforced route must answer 401). For the auth
probe: 404 = router unmounted (FAIL), 200 = auth NOT enforced (FAIL), 5xx = FAIL,
else WARN. WARN never alerts (so unconfigured optional integrations stay quiet).

## Shared transition store
Connection health reuses `provider_health_transitions` (the art-backend store).
Rows are namespaced with a `conn:` prefix (`connectionSlug`) and the table carries
a nullable `detail` column; `provider_id` was widened to 64 chars to fit slugs.
**Why:** one store + one prune path instead of a parallel table. History cap is a
LOCAL const (`CONN_HEALTH_HISTORY_LIMIT`), NOT the art `PROVIDER_HEALTH_HISTORY_LIMIT`
(that one is exported from art-providers, not `@workspace/db`).

## Reconcile semantics (`reconcileConnectionHealth`, pure + unit-tested)
FAIL→broken, PASS/WARN→healthy. First observation per connection is a SILENT
baseline. A flip only alerts after it HOLDS for the debounce window; flapping back
resets the clock. Recovery (broken→healthy) also alerts. Mirrors
`art-providers/backend-alerts.ts` exactly.

## Env toggles
`CONN_HEALTH_MONITOR` (off/false/0/no disables; default on), `CONN_HEALTH_DEBOUNCE_MS`
(2min), `CONN_HEALTH_POLL_INTERVAL_MS` (3min), `CONN_HEALTH_ALERT_EMAIL` (else
`ownerEmails()`). External script adds `HEALTH_CHECK_BASE_URL`, `CONN_HEALTH_WARN_EMAIL`,
`CONN_HEALTH_ALWAYS_EMAIL`.

Optional public enrichment integrations such as MusicBrainz must degrade to WARN on
timeouts; they should not make the core CRM, phone, or automation platform fail.

## Structure contract test
`__tests__/api-structure.test.ts` mounts the REAL aggregate router (routes/index.ts)
under `/api` with an injected logged-out auth shim (`req.isAuthenticated=()=>false`),
then asserts liveness=200, representative auth routes=401, and critical routers are
never 404 (the regression guard against a dropped `router.use(...)`). Runs against
real dev DB; handlers short-circuit at the auth gate so no external calls fire.

## Validation checks
Registered: `api-structure` (= `test:api-structure` vitest) and `api-health`
(= `health:all`). NOTE: `api-health` probes PRODUCTION and can send real alert
emails — do NOT trigger it casually during local verification.
