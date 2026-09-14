---
name: Shadow Tower floor authority
description: Durable rules for extending playable office floors without reintroducing visual, capacity, or settlement drift.
---

Shadow Tower office listings and gameplay must derive from the same shared floor specification. A visible object needs a real footprint, matching collision, a reachable interaction point, and a server-settled state; never add representative floor art or client-only capacity.

**Why:** Independent listing art, renderer defaults, and bot placement previously allowed the UI to depict offices and workers that did not physically exist or fit. Concurrent upgrade and activation paths also risked charging or activating without matching usable space.

**How to apply:** Extend the shared contract first, then project it into listings and rendering. Lock and re-read floor state inside FIAT transactions, keep every active human/bot assigned to a valid workstation, include settled upgrades in capacity, and honor the user's persisted accessible floor selection before deterministic fallback.

Authored resident waypoints are intent, not guaranteed walkable tiles; the renderer-side route projection must snap blocked endpoints to the nearest walkable tile before walking the shared collision map.

**Why:** Commercial residents and ambient Tower occupants can begin on room edges or furniture boundaries even when the authoritative plan is valid. Treating those raw waypoints as walkable leaks actors through walls and makes route tests fail.

**How to apply:** Keep the authoritative collision footprints unchanged, normalize each resident waypoint during route projection, and verify the final route contains no blocked tiles.