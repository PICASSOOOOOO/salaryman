---
name: Preview OIDC callback origin and iframe handoff
description: How Replit preview host headers and iframe popup behavior affect OIDC sign-in.
---

In the local Replit preview, the API can receive a loopback `Host` or
`x-forwarded-host` even though the browser entered through the public
`*.replit.dev` URL. OIDC callback URLs and PKCE cookies must use
`REPLIT_DEV_DOMAIN` for those loopback requests; public preview and production
requests should continue to use their forwarded/custom host. The login route
must redirect loopback requests to the public `/api/login` first so the cookies
are set on the same host as the callback.

**Why:** Sending the provider back to `https://127.0.0.1/api/callback` leaves
the browser outside the preview, while setting state cookies on loopback and
callbacking on `*.replit.dev` loses the PKCE state entirely. Both make sign-in
appear broken.

**How to apply:** Keep the loopback check server-side in the shared auth
origin resolver and preserve the request host for non-loopback traffic. For an
iframe sign-in, open a blank tab, clear its opener, then navigate it to OIDC.
Do not treat a null result from `window.open` with `noopener` as proof that a
popup was blocked; browsers may return null for a tab they did open. The
anonymous-access middleware runs before the `/api` router, so Express presents
the OIDC callback as `/callback`; exempt that mounted path or an expired guest
cookie will block session creation.