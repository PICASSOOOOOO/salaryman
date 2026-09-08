---
name: Complete Clerk account reset
description: Why deleting local users alone does not reset authentication accounts under managed Clerk
---

A complete development account reset must clear both the managed Clerk Development user store and SALARYMAN's local application rows. Clearing Postgres alone is not an account reset because a valid Clerk session can recreate the local identity bridge.

**Why:** Clerk Development and Production are separate identity stores outside the app database. Existing development identities remained able to sign in after a database-only reset, and JIT provisioning recreated their local rows.

**How to apply:** Confirm the Clerk credential is a development key before deleting identities, never touch Production unless explicitly requested, delete development Clerk users first, then clear local dynamic rows that active sessions may have recreated. Verify both stores report zero users.