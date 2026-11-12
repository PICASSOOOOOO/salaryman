---
name: Org Framer site reverse-proxy
description: How orgs host their own published Framer site at /sites/<slug>, and the SSRF-hardening constraints of the server-side fetch.
---

# Org Framer site reverse-proxy (/sites/<slug>)

An org can connect its OWN published Framer site; SALARYMAN reverse-proxies it at a
top-level path `/sites/<slug>` (Framer has no HTML export, reverse-proxy is its
supported self-hosting path). Mounted in app.ts ABOVE the prod static splat.
Gated to registered real businesses: the org OWNER has a `world_businesses` row
with `businessType='real'` (isOrgRegisteredBusiness). Management API
`/api/org-website` is gated by auth + resolveCurrentOrgId + canDoInOrg("website.manage")
+ that eligibility — eligibility is enforced on BOTH POST and PUT (DELETE is left
open, since disconnecting only REMOVES public exposure).

## SSRF is the whole game (framerOrigin is untrusted, fetched server-side)
`safeFetch` in lib/site-proxy.ts is the only path that fetches org-supplied URLs.
A plain `fetch(url, { redirect: "follow" })` is NOT safe: it validates only the
first hop and re-resolves DNS at connect time. safeFetch instead:
- re-runs classifyOrigin + public-IP DNS check on EVERY hop,
- follows redirects MANUALLY (capped depth) so each Location is re-validated,
- PINS the outbound connection to the validated resolved IP via a custom undici
  Agent `connect.lookup`, closing the DNS-rebinding TOCTOU window. TLS SNI/Host
  still use the real hostname, so cert validation is unaffected.

**Why:** an architect review FAILED the first cut for exactly these two holes
(redirect-follow bypass + rebinding window). Any new route that fetches a
user-supplied URL must go through safeFetch, never raw fetch.

## undici gotcha: standalone Agent is NOT compatible with Node's global fetch
**Why:** Node 24's global `fetch` is built-in undici, but a `dispatcher` (Agent)
constructed from the separately-installed `undici` npm package throws
`invalid onRequestStart method UND_ERR_INVALID_ARG` (version-mismatched internal
handler interface). **How to apply:** when you need a custom dispatcher/Agent,
import undici's OWN `fetch` (`import { Agent, fetch as undiciFetch } from "undici"`)
and call that — do not pass a standalone Agent to the global fetch.

The connect `lookup` callback must handle BOTH forms: undici calls it with
`{ all: true }` (return `[{address, family}]`) but the classic form is
`(err, address, family)` — handle both to be safe.
