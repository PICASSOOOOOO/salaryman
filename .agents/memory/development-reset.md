---
name: Development reset boundaries
description: How to reset SALARYMAN development accounts without touching production or boot catalogs.
---

Development resets have two separate authorities: PostgreSQL application rows and the managed Clerk development tenant. Clearing one does not clear the other. The Clerk development secret can be used through the Clerk backend SDK to delete development users; production identities remain separate.

**Why:** The existing admin world reset intentionally preserves Picasso and local login identities, so it cannot provide a true fresh signup test.

**How to apply:** For a fresh development signup test, clear user/org/business/application state while preserving boot catalogs, delete the development Clerk users through the managed development tenant, restart the API so system seeds rehydrate, and verify that only system seed orgs/catalogs remain.