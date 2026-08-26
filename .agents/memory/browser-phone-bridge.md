---
name: Browser phone bridge invariant
description: The reliability and security contract for outbound browser-to-PSTN calls.
---

An outbound phone call is not active until the browser Voice device is registered and every created PSTN leg has a successfully joined browser conference. Any join failure must roll back every created leg, and cleanup must report provider failures truthfully.

**Why:** Creating or displaying PSTN legs before the browser bridge succeeds can leave recipients ringing with no agent audio. Conference names also require identity binding so one browser identity cannot join another user's room.

**How to apply:** Route every outbound origin through the shared transactional bridge. Keep conference joins single-flight, make cleanup ownership-safe and idempotent, and probe the TwiML application/callback without placing a charged call.