---
name: Marketing Command Center / social connections
description: How real social posting + PRIME gating is wired for the Marketing Command Center
---

# Marketing Command Center

Real social-account connections + posting, unified under `/marketing`, gated behind PRIME.

## Provider model
- Two camps: credential/webhook providers post for real TODAY without platform review
  (Bluesky = AT Proto app password; Discord = channel webhook); OAuth providers
  (X, LinkedIn, Meta FB/IG/Threads, TikTok, YouTube) are metadata-only until the OWNER
  registers a platform app (env secrets) — they report `needs_app_config`.
- Provider registry exposes `verify()` + `publish()`; isProviderConfigured() decides OAuth availability from env presence.

## PRIME gating — the non-obvious part
- There is NO new feature key/column. PRIME = the existing `claw_bot` bundle. Gate everything
  with `hasFeature(userId, email, "claw_bot")`.
- **Two enforcement points, both required**: (1) the connection-management routes, AND
  (2) the real-publish path. The publish route (`/social/posts/:id/publish`) is shared with the
  in-game simulation, so it can't just 403 — instead it checks PRIME and, if absent, FALLS THROUGH
  to the simulated branch. **Why:** a user who connected while subscribed then downgraded must not
  keep posting for real, but non-PRIME players must still get the in-game "published" simulation.

## Publish contract
- PRIME + connected + provider.publish → real post, response `simulated:false` (+ url/externalId).
- Otherwise → in-game publish, response `simulated:true, needsConnection:<platform>` so the UI can
  nudge the user to connect. Publish failure marks `connection.lastError` and returns 502 (no status change).

## Credentials at rest
- `social_connections.credentials` JSONB stores secrets in plaintext — parity with existing
  `user_google_links` (also plaintext). Acceptable for parity, but flagged: a future hardening task
  should add app-layer envelope encryption. Don't treat the memory dir / DB as a secret store.

## Frontend
- `/marketing` IS the Command Center (replaced the old redirect to `/marketing/campaigns`).
  Nav MARKETING → `/marketing`. Logged-out/tutorial-incomplete viewers see Pablo (new-user funnel
  gate), not the page — that's expected, not a routing bug.
