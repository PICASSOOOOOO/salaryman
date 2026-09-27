---
name: Pablo chat retry safety
description: Retry behavior for command-mode chat that can spend currency or usage before an answer returns.
---

Do not automatically retry or offer a one-tap retry for command-mode requests after an ambiguous timeout or server error unless the server deduplicates the request. Command processing can consume usage or spend earned FIAT before generation finishes, and aborting the browser request does not cancel server work. Surface known auth, account, power, and rate-limit responses instead of treating them as service outages. Restrict simple retries to stateless chat or endpoints with idempotency.

**Why:** An eager fallback or user retry can repeat charges while the first server request is still running.

**How to apply:** Before adding retries to any Pablo command UI or client fallback, verify request-level idempotency for every side effect; until then, use a longer bounded wait and clear non-retryable responses.