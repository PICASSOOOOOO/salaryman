---
name: Pygame character grounding
description: Rendering rules for keeping Pygame office characters visually consistent and inside the playable viewport.
---

Use one shared sprite scale and one shared foot/shadow baseline for player and NPCs. Clip room actors and their labels to the space below the room header beam and above the footer; otherwise camera-following routes can draw into the HUD when an NPC reaches a room edge. Apply vertical offsets only for explicit jump or pose states.

**Why:** Camera-following trailer captures exposed two separate problems: asset-specific scale made characters look inconsistent, and world-space NPC positions could render under fixed UI chrome even when movement and collision were correct.

**How to apply:** Keep standing characters on the common grounded baseline, give jump a visible shadow anchor, keep sit/sleep poses grounded, and preserve the actor clip whenever the Pygame room UI is refactored.