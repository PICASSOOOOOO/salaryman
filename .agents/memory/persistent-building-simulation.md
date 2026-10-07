---
name: Persistent building simulation
description: User requirement for interactive, lasting object, character, weather, and building-system changes in SALARYMAN's game world.
---

Every building-scale game area should let characters interact with objects and
building systems: sit, move, open, store or hide items, barricade, steal, burn,
destroy, repair, decay, buy, sell, and package. Object, character-condition,
clothing, and environmental changes must persist instead of resetting after
interaction; cleanup and repairs require character action. Scope includes
indoor/outdoor weather, layered clothing, wounds/bleeding/stains, weapons and
spent casings, plus practical vacuuming, mopping, painting, plumbing, and
electrical tools.

**Why:** the user stated that these systems are required for the game.

The user chose this persistence boundary: lobby and hallway changes are shared
Tower-wide; each private office's changes are shared only with its organization.
Development proceeds floor by floor, starting with Floor 1.

**Why:** the user selected both the sharing boundary and real-building,
floor-by-floor development order.

Maintenance and object condition apply on every floor. Include the floor in the
server-resolved state scope so a repeated hallway object ID does not leak
condition between floors.

**Why:** the user clarified that maintenance is building-wide rather than
limited to the initial Floor 1 slice.

Floor 1 is one large lobby centered on a receptionist's desk area, with one ATM
and one vending machine. Elevator access and a staircase are grouped in a
clearly marked area with floor numbers on the walls. The building plan must
also retain below-grade basements, air ducts, and operations areas such as
shipping/receiving and a garage. Building geometry should use 3D walls and
show practical services such as pipes and electrical conduits/wires; doors
and elevators should be placed as parts of the building structure, not loose
decorative props.

Every building layout must reserve real space for wall thickness and wall
interiors, crawl/service spaces, and foundational structural beams. Treat these
as explicit building geometry, not zero-thickness visual boundaries.

**Why:** the user asked to make room for these structural areas in buildings.

**How to apply:** clarify whether stated room dimensions are clear interior sizes
or full structural footprints before moving boundaries; keep support/service
areas visible in the layout and out of usable floor space.

Each office is 90 × 110 m of clear interior space; fit four such offices plus
the shared hallway and elevator area. Structural space expands the building
footprint instead of reducing office interiors.

**Why:** the user clarified that the dimensions apply per office and do not
include the hallway or elevator.

**How to apply:** preserve 90 × 110 m interior bounds for every unit; add wall,
crawl/service, and foundation geometry outside or below those bounds.

Elevator travel should show entry from the lobby, a short camera zoom into a
transparent isometric elevator interior, and arrival in the selected floor's
hallway.

This elevator ride is the only special zoom/scene transition at this stage.
Stairs are direct physical climbs between floors. During the story lockdown,
the lobby's exterior front door stays locked and the player remains inside to
finish the work; this is a world-door rule, not a site-wide route gate.

Elevators and stairwells are core building transport for both players and NPCs;
they must connect people to the building areas they are authorized to reach.

**Why:** The user emphasized that elevators and stairwells transport players and
NPCs between parts of the building.

**How to apply:** Use the physical elevator/stair network for NPC floor changes
too; do not implement NPC movement as an unvalidated teleport or treat these
routes as player-only interactions.

The service elevator is for building staff only; ordinary tenant access is not
sufficient.

**Why:** The user clarified the service elevator's restricted audience.

**How to apply:** Check a server-authoritative building-staff assignment for
every service-elevator trip, separate from passenger elevator and stair access.

Tower maintenance NPCs must perform recurring daily generator work on B5 and
water-pumping work on B6 to keep those systems running. Trash accumulates until
workers take it to the B1 shipping and waste area at the rear of the building;
shipping receives important incoming supplies through a gated exterior area.
These operations need staffed positions and NPC incumbents. Human workers earn
promotion by outperforming the incumbent and take on greater responsibility;
the same career progression applies to Tower staff and all fictional companies.
Restrooms provide approximate stall privacy and help restore player stamina.

**Why:** the user specified daily utility upkeep, physical waste removal and
receiving, incumbent-based promotions across fictional employers, and private
restrooms with a stamina benefit.

**How to apply:** Keep utility and waste work visible and action-based, use
server-owned state for system condition and task completion, and make career
rules reusable across employers instead of creating a Tower-only exception.
Represent restroom privacy in the physical layout and validate stamina recovery
through the authenticated game account.

**Why:** the user clarified the lobby layout, required 3D building systems, and
named below-grade, operational, elevator, stair, and story-lockdown details
that must remain in the building plan.

Everything should decay over time. Cleaning and repair should be profitable
business services. Repair, construction, electrical, concrete, plumbing,
natural-decay remediation, renovation, and customization should become
organization work and income loops. An NPC or real person must physically do
the work over time with live animations; office permissions govern renovation
and customization, and employment changes should carry story consequences.

**Why:** the user said all game state should decay and cleaning/repair businesses
should profit, and described the wider activities as organization income loops
that require physical action, elapsed work time, hiring, and story consequences.

**How to apply:** Apply decay broadly across simulated world state; design
cleaning and repair as profitable organization services, not fixture-only
actions.

The game company should have a construction office in the Tower that creates
real estate. Each building is an isolated logical instance in the shared
authoritative server, not a separate server process. People can create offices
from SALARYMAN assets or new Godot designs; NPCs or public players can
participate in construction. The public contributor project exposes a Godot
building kit only, not the proprietary full-game source. Unready Story Mode
areas may remain locked, and created buildings follow the Tower's rules.

**Why:** the user wants developers and players to build new real estate inside
the shared world without bypassing the established Tower rules or story locks,
and selected a Godot-only contributor kit with shared-server building
instances.

**How to apply:** Resolve each action's scope from server-validated room
presence and office ownership. Preserve object and character state; validate
destructive actions against the owner of each space. Use server-authoritative
persistence for shared Tower state rather than treating the local
Godot/Python bridge save as shared world truth.
