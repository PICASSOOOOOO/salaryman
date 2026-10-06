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

**How to apply:** Build a complete Tower vertical slice, preserving object and
character state and validating destructive actions against the owner of each
space. Use server-authoritative persistence for shared Tower state rather than
treating the local Godot/Python bridge save as shared world truth.
