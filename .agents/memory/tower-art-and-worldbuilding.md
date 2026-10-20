---
name: Tower art and NPC worldbuilding
description: The Tower needs polished interior decoration and lived-in NPC stories that build a connected ecosystem within the building.
---

Prioritize authored interior art and coherent environmental storytelling inside the existing Tower. NPCs should have specific jobs, routines, and relationships across the building's real businesses and services; keep the cast focused and do not imply unimplemented economic behavior.

**Why:** The user asked for polished interior decoration and richer worldbuilding, with NPC narratives creating an ecosystem within the building.

**How to apply:** Deepen one playable Tower area at a time using existing floors, routes, businesses, and NPC systems. Keep renderer-only decoration separate from Python-owned collision, interactions, and economy, and make story hooks consistent with actual locations.

NPC-owned shops should be allowed to grow or fail; a failure creates a real
opening for player-owned businesses. Pablo Corp supports the Tower's
infrastructure while retaining control behind the appearance of an independent,
living ecosystem. The extensive main story is the rare, deliberate path for
ultimately defeating Pablo's bad actors; it should not constantly interrupt or
force players away from living in the MMO world. Use RDR2 as a reference for an
immersive, lived-in world and pacing, not as a source to copy.

The shop ecosystem needs a small roster of new NPC competitors: aim for 2–3,
with at least one required for an initial implementation. They must compete with
one another and with player shops, while also being able to cooperate. Use a
Nemesis-style persistent relationship model so cooperation and rivalry change
business behavior and create relevant opportunities. Source search found only
a disposition-data reference to "nemesis," not an implemented engine.

**Why:** The user wants balanced NPC and player opportunities, a dystopian
corporate power structure, and a substantial but seldom-forced story path.

**How to apply:** Let NPC business failure open space for players without
guaranteeing either outcome. Keep Pablo's structural control visible through
systems and atmosphere, and make story progression extensive but infrequent and
player-led within the persistent world.

**Why:** the user wants 2–3 NPC shop competitors (one is the minimum), with
meaningful cooperation and competition between them.

**How to apply:** implement persistent rival/cooperation relationships for NPC
shop owners; do not assume a Nemesis engine already exists or make rivalry a
cosmetic label.
