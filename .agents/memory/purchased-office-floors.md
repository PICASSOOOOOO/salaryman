---
name: Purchased office floors
description: Durable rules for property-specific office layouts and avatar return-position restoration.
---

Each purchased office deed maps to one authoritative floor specification that owns dimensions, capacity, named zones, stations, spawn, and camera bounds. Tower and campus deeds use clearly named representative flagship/connected zones rather than pretending the full real-world acreage fits in one room.

Custom offices need an extensible, suite-scoped layout/customization model for both owned and rented spaces. Visibility is discovery-based: public spaces are visible; undiscovered private offices stay obscured; discovered offices show only the last-known snapshot, never live occupants or changes unless the player is physically there. Discovery does not grant access. Authorized suite users enter automatically; other visitors need that suite’s password.

A rented or owned office starts with one private executive office containing a desk, chair, and terminal; the rest of its floor is open. All additional furniture, partitions, rugs, lamps/lighting, water coolers, couches, and private-bar fixtures are purchased and placed. Alcohol is an important usable game item. Walls may create storage rooms for organization-owned inventory; keep that stock separate from personal inventory.

Furniture and decor need repeatable purchases that stack in owned inventory, so players can furnish meeting rooms and shared spaces with multiple matching pieces. Keep the one-copy purchase rule for unrelated equipment.

**Why:** Collapsing seven deeds into a few fixed-width tiers made major properties visually interchangeable and allowed renderer, station, and camera geometry to drift apart.

**Why:** The user specified a purchase-driven office simulator, with a minimal starter executive office, open surrounding floor, a private executive bar/alcohol use, and organization storage rooms built from walls.

**Why:** A single-copy inventory cap makes realistic office layouts impossible; repeatable furniture/decor are a distinct product rule from unique equipment ownership.

**Why:** the user wants custom office layouts and customization for owned or rented offices, with privacy fog and characters/NPCs. They clarified that private rooms reveal only a past snapshot after discovery; seeing current people or changes requires being there.

**How to apply:** Add or change an office property through the property-keyed floor specification, not independent constants in the page or renderer. Keep custom placements suite-scoped and separate from the protected building shell. Keep discovery snapshots separate from live presence and enforce room access server-side. Persist return pose per character slot and property; validate it against the current floor before restoring so deed changes and stale coordinates fall back to spawn.