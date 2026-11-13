---
name: Tower collision spatial index
description: Keep per-room collision lookups fast while NPC and construction objects change.
---

Maintain collision lookups incrementally when objects are added, removed, or moved. The basement security patrol changes position on each simulation update, so rebuilding the full Tower index for each move would erase the collision optimization.

**Why:** The Tower registry contains many objects across inactive rooms, while a moving NPC can update every frame.

**How to apply:** Route mutations that change an object's room, visual position, or solid extents through registry operations that update or invalidate the index. Avoid direct edits to the object list.
