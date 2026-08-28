---
name: Authoritative world economy
description: Authority boundaries for FIAT, quick jobs, commodity cargo, market quotes, and position-gated settlement.
---

Spendable FIAT, repeatable job runs, commodity cargo, market quotes, and the exterior position used for economy authorization must remain server-owned. Client save fields and UI state are compatibility snapshots only.

**Why:** Moving only prices or balances to an API still allowed forged rewards when clients could invent claim occurrences, locations, cargo, or concurrent retry keys.

**How to apply:** Settle wallet and domain state in one locked transaction; use durable one-time/idempotency constraints; derive prices and locations server-side; gate jobs/trades on validated persisted exterior position; reconcile client state only from successful server responses.