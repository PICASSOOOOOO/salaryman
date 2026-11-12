---
name: Legacy purchase recovery
description: Reset-independent protection for player balances and purchased ownership.
---

Durable recovery must be recorded outside gameplay/reset tables. Capture normalized-email snapshots transactionally before a wipe, record purchase events in the same transaction as FIAT debit and inventory grant when possible, and restore under an email-scoped advisory lock.

**Why:** A world reset can delete wallet, inventory, saves, and entitlement rows together; preserving only the current tables cannot recover older players, and post-transaction event writes can race a reset.

**How to apply:** Bind recovery to the authenticated local account and economic identity, reject ambiguous normalized-email collisions, make restoration monotonic/idempotent, and never let repeated login, webhook delivery, or reset replay double-credit ownership or FIAT.