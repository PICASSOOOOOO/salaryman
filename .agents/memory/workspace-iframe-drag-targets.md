---
name: Workspace iframe drag targets
description: Browser-native drag and drop over embedded workspace features.
---

Disable pointer events on workspace feature iframes for the duration of a drag. Otherwise a drop over embedded content can be intercepted by the iframe and never reach the parent slot's drop handler.

**Why:** Native browser drag verification targeted a widget card center and did not reorder it, while synthetic event tests passed; the target was over an embedded frame.

**How to apply:** If a drop target contains a feature iframe, apply a temporary dragging state that makes the iframe ignore pointer events, then restore interaction at drag end.
