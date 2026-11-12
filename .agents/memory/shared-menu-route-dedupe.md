---
name: Shared menu route deduplication
description: Preserve distinct destinations when consolidating SALARYMAN navigation menus.
---

When consolidating navigation, deduplicate exact route paths, not display labels. Keep same-label destinations when their paths or scopes differ, and add short context hints so users can tell them apart. The START WORK and MENU triggers should open the same destination catalog.

**Why:** Business and CALLL HOME contacts are separate destinations even though both are named CONTACTS; dropping either path would hide a real workflow.

**How to apply:** Build one shared catalog from existing route sources. Test that every source route remains represented, paths are unique, repeated labels keep their context, and staff-only destinations remain access-filtered.
