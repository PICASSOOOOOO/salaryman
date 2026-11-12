---
name: Collections case cross-device progress
description: Server-authoritative B2 case progress while preserving older local-only saves.
---

For linked play, the account's server stage controls the displayed Collections case and the server alone validates station order. Do not upload or adopt a stage from an older local save. Keep that local stage intact for offline use, and persist server-confirmed progress only when it advances the local save.

**Why:** Existing local-only progress cannot be authenticated, but replacing it immediately with a new account's stage zero would discard offline progress.

**How to apply:** Keep the server stage ephemeral in the client session, prefer it while linked, and never let a client-supplied stage advance the server record.
