---
name: Organization custom pages
description: Product boundaries for organization-owned custom pages in SALARYMAN's My Apps area.
---

Custom pages fill organization-specific workflow gaps that SALARYMAN does not already cover. Pages are published and used inside SALARYMAN, and their records are scoped to the active organization. Page definitions use constrained typed fields rather than user-authored code or arbitrary outbound API requests. Reuse the existing API, webhook, and connection management surfaces instead of duplicating them.

**Why:** The user requested organization-only custom pages and emphasized avoiding duplicate SALARYMAN features; unrestricted code and outbound calls would also bypass the platform's existing security boundaries.

**How to apply:** Keep membership, permissions, publication visibility, and record queries server-authoritative and organization-scoped. Extend external API execution only through a separate, reviewed provider-operation design.
