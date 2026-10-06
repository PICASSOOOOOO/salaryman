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

Floor 1 is one large lobby centered on a receptionist's desk area, with one ATM
and one vending machine. Elevator access and a staircase are grouped in a
clearly marked area with floor numbers on the walls. The building plan must
also retain below-grade basements, air ducts, and operations areas such as
shipping/receiving and a garage.

**Why:** the user clarified the lobby layout and named building areas that must
remain in the long-term scope.

**How to apply:** Resolve each action's scope from server-validated room
presence and office ownership. Preserve object and character state; validate
destructive actions against the owner of each space. Use server-authoritative
persistence for shared Tower state rather than treating the local
Godot/Python bridge save as shared world truth.
