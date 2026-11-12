---
name: Avatar rendering (profile photos)
description: Why a raw user-photo <img> breaks and the policy for showing photos everywhere a user appears.
---

**Rule:** never render a user photo with a bare `<img src={profileImageUrl}>`. Uploaded avatars are stored as a RAW object path ("/objects/..."), not an absolute URL, so a bare src 404s — only OAuth users (absolute URLs) render. Always pass the value through the shared `resolveAvatarUrl` (in `interview-helper/src/lib/avatar.ts`) and keep initials as the fallback.
**Why:** the upload endpoint persists the object path verbatim; the public storage route is what actually serves it.

**World-map presence photos — trust boundary.** Online players on the map come from two sources, and neither should ever take a photo URL from the client:
- REST `heartbeats` map → photo comes from `req.user.profileImageUrl` server-side.
- Live WebSocket `players` → photo is resolved at the WS handshake from the authenticated **session cookie** (parse the cookie header manually; `req.cookies` is not populated on a raw upgrade request), looked up async so the connection isn't blocked.
**Why:** the game/world client does not carry the user's photo, and a client-supplied avatar URL is untrusted. Resolve identity from the session, not from query params.
