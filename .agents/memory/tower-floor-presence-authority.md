---
name: Tower floor presence authority
description: Authority rule for workers and announcements rendered in physical Shadow Tower scenes.
---

Visible NPCs, Pixel Agents, jobs, and announcements on a Shadow Tower floor must come from a server response scoped to that city and physical floor (plus office unit/workstation where relevant). Never reuse a caller's general bot roster as floor presence.

**Why:** A general roster has activation and ownership state but no authoritative location. Client-side placement makes the same worker appear simultaneously on every visited floor and falsely presents activity as live.

**How to apply:** If a location-scoped feed does not exist, keep the scene unpopulated rather than inventing placement or task text. Add server authority first, then render only matching records and suspend polling while hidden.