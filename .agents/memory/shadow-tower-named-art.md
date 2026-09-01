---
name: Shadow Tower named art
description: Defines the durable boundary between interactive Tower geometry and finished visual assets.
---

Finished Shadow Tower rooms, fixtures, and characters must have explicit names and entries in the shared Tower art manifest. Procedural canvas geometry may preserve movement, collision, and interaction behavior, but it is scaffolding rather than the accepted final visual layer.

**Why:** Generic canvas boxes and anonymous paper-doll characters were mistaken for the requested object-by-object, character-by-character art pass.

**How to apply:** Extend the Tower art manifest whenever completing a room. Map every visible interactive fixture and named occupant to dedicated art while keeping authoritative floor geometry and gameplay contracts unchanged.