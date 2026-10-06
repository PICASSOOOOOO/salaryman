---
name: Tower physical floor shells
description: Every elevator stop must resolve to a playable or access-held physical floor shell.
---

The Shadow Tower treats an elevator stop as a physical destination, not merely a directory or Realty link. Vacant, sealed, and restricted floors still render their authoritative geometry; access is held at the floor boundary rather than hiding the address.

**Why:** A directory-only stop breaks the fiction that the Tower is a real building and makes floor pricing, occupancy, construction, and future NPC operations impossible to experience in-world.

**How to apply:** Route new stops through the shared floor scene and canonical plan contract. Preserve specialized public floors, but ensure every stop has an elevator, stairs/circulation, collision-safe movement, and a truthful status identity.

The elevator itself is a cabin-sized room that encloses and carries the player between open floors; it is not a doorway-only teleport.

**Why:** The user clarified that the elevator should feel like a mini room traveling up and down the building.

**How to apply:** Keep the cabin geometry present during travel, move it and the player in the direction implied by the destination floor, and leave floor availability server-authoritative.