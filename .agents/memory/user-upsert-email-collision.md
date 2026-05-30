---
name: User upsert email collision
description: Why OIDC upsertUser must link by (lowercased) email, not just onConflict(id)
---

# OIDC user upsert must handle the email unique constraint

`users.email` carries a `unique()` constraint. The OIDC `upsertUser` (routes/auth.ts)
originally did only `onConflictDoUpdate({ target: id })`. When the same person signs in
through a second provider (e.g. first Discord-linked, later Replit) they arrive with a
**different `sub` (id) but the same email** → the email-unique violation throws and
`/api/callback` 500s, locking the user out.

**Fix shape (mirror upsertDiscordUser):**
1. Normalize email to lowercase before any lookup/insert.
2. `linkExistingByEmail()` pre-check: if a row with that email exists under a different id,
   update that existing row (link the new provider) instead of inserting.
3. Wrap the insert in try/catch and, on a unique violation (TOCTOU between the pre-check and
   insert), retry as an update-by-email. This closes the race two concurrent logins create.

**Why:** the pre-check alone is not atomic; without the catch-and-retry, simultaneous
first-time logins for the same email still 500.

**How to apply:** any new auth provider / upsert path that writes `users` must go through
the same lowercase-normalize + link-by-email + retry, or it reintroduces the cross-provider
500.
