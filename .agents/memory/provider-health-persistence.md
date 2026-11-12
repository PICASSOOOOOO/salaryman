---
name: Provider health timeline persistence
description: Where the art-backend up/down history lives and the rules for recording transitions
---

The render-backend health timeline ("online/offline since …" + recent flips) is
persisted in the `provider_health_transitions` table (lib/db/src/schema/provider-health.ts),
NOT an in-memory Map — so it survives a server restart and is shared across admins.

Rules / gotchas:
- `at` is epoch-ms stored as `bigint` (mode "number"), matching what the admin UI
  already consumes — do NOT switch to a timestamp column or the round-trip drifts.
- `recordProviderHealth` (artifacts/api-server/src/lib/art-providers/index.ts) is
  ASYNC and DB-backed: it inserts a row ONLY on an actual flip (latest.health !==
  new health). Re-observing the same state inserts nothing and leaves lastChangedAt
  put — that idempotency is the contract the admin "since …" clock relies on.
- Newest row for a provider = start of its current run; queries order by
  (at desc, id desc) so same-ms flips disambiguate by serial id.
- Pruning runs right after each insert (pruneProviderHealthHistory), capping rows
  per provider at PROVIDER_HEALTH_HISTORY_LIMIT (8). It only runs on a flip, so a
  provider removed from REGISTRY leaves rows behind (see follow-up sweep task).
- Only `listProviderSummariesWithHealth` (blocking) records transitions; the
  non-blocking sibling returns "checking" and never writes — backend-alerts'
  periodic blocking call is the steady recorder.

**Why:** in-memory history reset every backend's "since" clock on every deploy/restart.

**Testing:** the suite is a real dev-DB integration test (serial, like the phone/
autopilot tests) — real wall-clock time, forceReprobe()=clearProviderHealthCache()
instead of fake-timer advance, assert relative ordering not fixed epochs.
