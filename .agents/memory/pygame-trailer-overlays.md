---
name: Pygame trailer overlays
description: Safe placement rules for capture labels and modal pages in Pygame gameplay footage.
---

Trailer shot labels must not occupy the same coordinates as page titles or content. When a page is open, move the shot label into unused page space and use an opaque modal veil so the underlying footer HUD cannot ghost through the page.

**Why:** The terminal interaction label previously covered the tools page title, while the dimmed base footer remained visible underneath the modal.

**How to apply:** Treat capture labels as layout-aware overlays, not fixed global chrome. Recheck each page-opening trailer phase after changing page geometry or footer placement.