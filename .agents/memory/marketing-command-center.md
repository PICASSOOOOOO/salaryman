---
name: Marketing Command Center / social connections
description: How real social posting + PRIME gating is wired for the Marketing Command Center
---

# Marketing Command Center

Real social-account connections + posting, unified under `/marketing`, gated behind PRIME.

## Provider model
- Customers bring their own developer apps for OAuth platforms; do not require one shared owner app.
- Bluesky (app password) and Discord (webhook) have direct provider implementations. OAuth provider entries
  for X, LinkedIn, Meta FB/IG/Threads, TikTok, and YouTube need real per-provider OAuth and publishing flows
  before they are live; metadata alone must never be treated as a successful publish.
- Provider registry exposes `verify()` + `publish()`; only a verified account with a live publisher may post.

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
- Encrypt `social_connections.credentials` with app-layer AES-GCM, binding ciphertext to user ID and provider.
- The encryption key uses `SOCIAL_CREDENTIALS_ENCRYPTION_KEY` when configured, with a domain-separated
  `SESSION_SECRET` fallback. Legacy plaintext rows are supported and upgraded on their next live use.
- Never return saved credentials to the client; connection responses expose only status/account metadata.
  **Why:** users configure their own social apps, so app secrets and access tokens are customer data.
  **How to apply:** any new OAuth setup or token-refresh path must use the same encrypted credential helper.

## Autonomous publishing
- The marketing autopilot is live-only: an unconfigured provider or missing connection must leave the post
  as a draft/error, never turn it into a simulated success. Manual/game publish can retain its simulation path.

## Frontend
- `/marketing` IS the Command Center (replaced the old redirect to `/marketing/campaigns`).
  Nav MARKETING → `/marketing`. Logged-out/tutorial-incomplete viewers see Pablo (new-user funnel
  gate), not the page — that's expected, not a routing bug.
