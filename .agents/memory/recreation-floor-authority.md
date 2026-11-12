---
name: Recreation floor authority
description: Durable integrity rules for the public REC floor, games, stamina, effects, and consumables.
---

REC is a public, system-owned Shadow Tower floor: it must not depend on an organization lease or create a purchasable floor record. Game sessions, stamina, timed effects, inventory, sponsor rewards, and replay markers are server-owned and settled under a locked save transaction. Generic browser saves must preserve the persisted REC namespace instead of accepting client replacements.

**Why:** REC mixes movement, rewards, FIAT purchases, consumables, and temporary perception changes. Client-owned state would allow reward replay, free purchases, stamina resets, and effect expiry manipulation.

**How to apply:** New REC games and goods must use stable request IDs, server timestamps, authoritative wallet/inventory helpers, and the shared public floor contract. Never add cash-out or real-money gambling. Large station footprints need a walk-up radius that reaches an adjacent non-collision tile.