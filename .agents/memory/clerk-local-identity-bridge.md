---
name: Clerk local identity bridge
description: Durable identity and transport rules after the Replit Auth to Clerk migration.
---

Browser authentication uses Replit-managed Clerk cookies, while local application identity continues to use the signed `sessionClaims.userId` value. Migrated users carry their legacy local ID there; new users carry their Clerk-native ID. Do not recover or merge local identity by matching email during a request.

**Why:** Ownership, authorization, saves, chat, phone, and world data are keyed by the existing local user ID. Using Clerk's native ID for migrated users disconnects their data; using an email collision fallback can assign one signed-in person another user's local account.

**How to apply:** For HTTP and WebSocket request authentication, verify the Clerk session first, resolve the local row by `sessionClaims.userId`, and use `auth.userId` only for Clerk API calls. Web requests use same-origin cookies only—never add bearer-token handling.