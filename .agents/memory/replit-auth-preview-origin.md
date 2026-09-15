---
name: Preview OIDC callback origin
description: How Replit preview proxy host headers interact with browser-reachable OIDC callbacks.
---

In the local Replit preview, the API can receive a loopback `Host` or
`x-forwarded-host` even though the browser entered through the public
`*.replit.dev` URL. OIDC callback URLs must use `REPLIT_DEV_DOMAIN` for those
loopback requests; public preview and production requests should continue to
use their forwarded/custom host.

**Why:** Sending the provider back to `https://127.0.0.1/api/callback` leaves
the browser outside the preview and makes sign-in appear broken.

**How to apply:** Keep the loopback check server-side in the shared auth
origin resolver and preserve the request host for non-loopback traffic.