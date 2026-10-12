---
name: Purchased office floors
description: Durable rules for property-specific office layouts and avatar return-position restoration.
---

Each purchased office deed maps to one authoritative floor specification that owns dimensions, capacity, named zones, stations, spawn, and camera bounds. Tower and campus deeds use clearly named representative flagship/connected zones rather than pretending the full real-world acreage fits in one room.

Custom offices need an extensible, suite-scoped layout/customization model for both owned and rented spaces. The same room boundaries must later support privacy fog and meaningful character/NPC placement.

**Why:** Collapsing seven deeds into a few fixed-width tiers made major properties visually interchangeable and allowed renderer, station, and camera geometry to drift apart.

**Why:** the user wants custom office layouts and customization for owned or rented offices, with privacy fog and characters/NPCs built on those room boundaries.

**How to apply:** Add or change an office property through the property-keyed floor specification, not independent constants in the page or renderer. Keep custom placements suite-scoped and separate from the protected building shell. Persist return pose per character slot and property; validate it against the current floor before restoring so deed changes and stale coordinates fall back to spawn.