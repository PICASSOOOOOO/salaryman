---
name: Tower office access
description: Shadow Tower suite entrances use the existing floor-level access authority rather than separate per-unit credentials.
---

All executive and business suite doors on a real occupied Tower floor share the existing server-authoritative floor access contract. The client may render lock hints and collect a password, but only the floor access endpoint grants entry; vacant and sealed shells do not invent locks or tenant access.

**Why:** The database already owns floor password, owner, organization-role, and classification rules. Adding per-unit credentials would create a second authority and make the shared playable plan disagree with access management.

**How to apply:** Keep door metadata in the shared plan, derive collision and visuals from that metadata, and use the floor GET endpoint with `x-shadow-tower-password` for entry checks. Never expose password hashes or compare passwords in the browser.