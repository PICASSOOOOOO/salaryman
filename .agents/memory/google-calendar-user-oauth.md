---
name: Per-user Google Calendar authorization
description: Who authorizes Google Calendar and which account boundary must be preserved
---

Each SALARYMAN user authorizes their own Google account from the app. Never use a
Replit Google connector attached by the project owner as the shared source of
customer calendar data.

**Why:** An environment-level owner connection would expose or synchronize the
wrong account and cannot represent many independent users.

**How to apply:** Keep connection status, OAuth state, tokens, imports, updates,
disconnects, and event ownership scoped to the authenticated user. The app may
have one provider OAuth client configuration, but no customer should need the
owner to connect a personal Google account for them.