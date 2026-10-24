---
name: Tower basement departments and access
description: Department assignments, vertical circulation, construction power exports, and pest pressure for the primary Tower.
---

The Tower basement departments are:
- B1: eight named operations—admin, shipping, trash, food supplier, construction, materials supplies, power, and water—in the interior half; the other half is an outside loading/staging yard. The yard gate connects to a rear entrance in the F1 lobby, and freight/waste stations stay in the yard.
- B2: jail, corporate security, and the Collections department share one floor. Collections is the dominant, frequently used department and the main crime in the story is committed there. Security and investigators are corporate staff, not police; only one or two patrol the building. Include cells, Collections offices, a small security office/armory, investigations, and fictional emergency communications to other servers/buildings.
- B3: disaster response for fires, floods, outages, biohazards, and corpses, with an incinerator, fire station, and maintenance crew.
- B4: vital-supplies storage.
- B5: power station and backup generators; this is the source for area-specific construction power exports.
- B6: water-pumping and plumbing department.

Basement development is currently the top game-building priority; finish and deepen B1–B6 before returning to Tower shop-floor expansion.

**Why:** The user explicitly said to build out the basements too and make them the top priority.

**How to apply:** Prioritize functional, role-specific basement gameplay across B1–B6 over additional shop-floor work.

One service elevator serves the basements and the upper Tower. The lobby also has
about four passenger elevators and two separate stairwells. This supersedes the
earlier temporary stairs-only basement restriction; keep all destinations
server-authorized.

Floors 2–5 remain walkable construction shells; Floors 2–7 keep their existing
elevator/build-status rules. Floor 7 hosts Rinse 67 only; Floors 8–67 remain
closed. Exported power must be targeted to a specific construction area, and
prepared work still requires active player/NPC participation.

Pests should appear more often when player and NPC activity is low.

**Why:** The user specified these department roles, the B1 half-yard/rear-entry
layout, vertical circulation, and
activity-based pest pressure; clarified that Collections shares the jail floor
where the main crime is committed and is more common than security work; stated
that security/investigators are not police and only one or two patrol; and
replaced the temporary stairs-only basement restriction with a full-height
service elevator.

**How to apply:** Keep the physical layout, game rendering, API access checks,
rear-entry routing, and shared building utility state consistent. Security communications and
investigations are fictional in-game systems; never turn them into access to
real-world private systems.

Basement object positions already use the compact server/maze coordinate grid.
Register new basement objects with legacy-coordinate scaling disabled.

**Why:** The object registry expands legacy room-local coordinates, while
basement movement and access checks use 1,000-unit maze cells. Scaled fixtures
can appear in the registry but land outside the playable tunnel.

**How to apply:** Explicitly opt basement objects out of legacy scaling and test
their positions against the matching floor's walkable cells.
