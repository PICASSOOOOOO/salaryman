---
name: Clerk auth bootstrap 401 race
description: Clerk may finish browser sign-in before the API middleware sees the new session.
---

On the immediate post-sign-in onboarding read, a 401 can be a short-lived Clerk/API
handoff race rather than an expired session. Bootstrap reads must retry without
triggering the global session-expiry redirect; otherwise users can bounce back to
sign-in or remain on an empty loading surface.

**Why:** The browser auth state can become signed-in before the server-side Clerk
middleware/JIT user bridge is ready, especially on a fresh development account.

**How to apply:** Keep the special handling limited to onboarding/bootstrap reads.
Protected app requests should continue to use the normal 401 redirect behavior, and
returning users with a completion marker should remain fail-closed when authoritative
onboarding state cannot be read.