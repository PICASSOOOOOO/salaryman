---
name: Replit session identity bridge
description: Identity and session rules after moving SALARYMAN from Clerk to Replit Auth
---

The browser authenticates with Replit OIDC and the API stores opaque session records in the app database. The OIDC subject is not assumed to equal an existing SALARYMAN user id.

**Why:** The project already contains product data keyed to local user ids. Matching a returning OIDC identity by normalized email before creating a new local row preserves that data across the auth-provider migration.

**How to apply:** Keep HTTP and WebSocket authentication on the same database-backed session cookie. When provisioning a callback user, prefer an existing local id matched by email; only use the OIDC subject for genuinely new local accounts. Development resets clear local sessions and rows, while provider identities remain managed by Replit.