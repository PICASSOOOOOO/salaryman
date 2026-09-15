---
name: Auth bootstrap 401 race
description: Browser sign-in can complete before the API onboarding bridge catches up.
---

On the immediate post-sign-in onboarding read, a 401 can be a short-lived browser/API
handoff race rather than an expired session. Bootstrap reads must retry without
triggering the global session-expiry redirect. The explicit `/console` post-login
handoff must not be held behind that optional onboarding read, and the handshake must
have a bounded fallback so a slow or unavailable API cannot leave a blank loading
surface forever.

**Why:** The browser auth state can become signed-in before server-side session
middleware or just-in-time user provisioning is ready. Returning users otherwise get
stuck on the route-handshake screen even though the login callback succeeded.

**How to apply:** Keep special handling limited to onboarding/bootstrap reads, let
protected pages perform their own auth check, and defer background requests until
hydration resolves. Eager-load or idle-prefetch the public `/pablo` route without
putting its heavy Three bundle in the homepage path. When the app is embedded in
the Replit preview iframe, open the OIDC handoff in a new tab; Replit auth refuses
to render inside that iframe. Do not remove the normal 401 redirect behavior from
ordinary protected API requests.