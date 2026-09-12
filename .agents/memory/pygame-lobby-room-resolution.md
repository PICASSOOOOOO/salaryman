---
name: Pygame lobby room resolution
description: The desktop tower lobby is a whole-world fallback and must never win room detection over smaller playable rooms.
---

Room detection must prefer the smallest non-lobby room containing the player, then fall back to the lobby only when no playable room contains the position.

**Why:** The lobby bounds cover the entire world. Checking rooms in declaration order caused any movement inside an office to snap the scene back to the empty lobby, which made captures and gameplay appear to lose the office.

**How to apply:** Preserve the smallest-room-first rule whenever floor-plan room detection or movement collision logic is changed; add a regression test for moving after selecting an office.