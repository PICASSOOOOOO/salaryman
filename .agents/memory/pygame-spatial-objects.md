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

Physical props also need two coordinate concepts: an interaction anchor for proximity/actions and a visual anchor for where the sprite is drawn. Desk and chair footprints own movement collision; tabletop props such as terminals, phones, and lamps should not become separate floor obstacles.

**Why:** Using one floor coordinate for both concerns put the player on top of the desk, made monitors appear to sit on the floor, and trapped the executive spawn inside the chair when solid collision was added.

**How to apply:** Give tabletop props a display position, keep their interaction point reachable from the open side of the desk, and place every room spawn outside solid footprints.