---
name: Pygame spatial object boundary
description: How the standalone Pygame tower scene keeps physical objects separate from simulation authority.
---

# Pygame spatial object boundary

The standalone Pygame tower uses a renderer-agnostic `OfficeObjectRegistry` and `TowerScene`. Objects own identity, room, position, prompt, and route metadata; they do not draw themselves or own economy state.

**Why:** The desktop client is intentionally separate from React/API today, while physical objects still need to reuse existing simulation actions and feature routes rather than creating parallel systems.

**How to apply:** Add new physical objects to the registry, dispatch money/worker changes through `OfficeState`, and keep inventory persistence or web/Pledge synchronization as a separate integration boundary.

The attached office-management prototypes are reference material only: take useful workflows such as recruitment or notifications, but keep the existing dashboard as the default and route all mutations through `OfficeState`.

**Why:** Replacing the established office surface with a parallel prototype would risk losing the tested wage, break, ledger, and tower behavior; optional desks are easier to evaluate and remove.

**How to apply:** Integrate new office workflows behind explicit UI state or controls, and preserve the existing workfloor path until the replacement is intentionally approved.