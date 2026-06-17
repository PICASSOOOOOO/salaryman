---
name: Crafting system
description: How player crafting works — server-authoritative, faction-agnostic, two material ledgers, utility-output guard.
---

# Crafting system

Crafting is **server-authoritative and open to ALL players** (the old Outlaws-only
client-side cargo recipes in WorldPlay were retired). Recipe catalog is a pure
module: `artifacts/api-server/src/lib/crafting-catalog.ts` (unit-tested).
Endpoints live in `routes/items.ts`: `GET /items/recipes` (enriched display
metadata) + `POST /items/craft`. Client UI is `components/CraftingPanel.tsx`,
opened from the WorldPlay top-menu "CRAFTING" entry (reuses `showCrafting`).

## Two input ledgers
Recipe inputs are tagged by `kind`:
- `resource` → harvested resources in `resource_inventory` (per-user, NOT slot-scoped).
- `item` → stackable material consumables in `player_inventory` (per-slot; type "material").

Output is a catalog item granted to `player_inventory`: stackable consumables use
`addConsumable(qty)`; boolean-owned gear inserts once (`onConflictDoNothing`, and
craft rejects 409 "already own" so inputs aren't wasted). Craft is one DB
transaction — any input shortfall rolls back the whole thing (409 "Missing materials").

## HARD RULE — utility monopoly
Batteries / fuel / gas / electricity are Pablo-monopoly and **never craftable**.
`isUtilityOutput()` (type === battery|fuel) guards this in two places: a load-time
assertion over every recipe in crafting-catalog.ts (bad recipe = boot crash), and
again at craft time (403). **Any new recipe must respect this** — never add a
recipe whose output is a battery/fuel item.

**Why:** the in-game economy depends on utilities staying a paid monopoly; a
craftable battery would let players mint free power.

## Conventions
- Recipes are FLAT (no tech-tree / unlock gating) — refine (resource→material)
  and gear (material→equipment) are just two categories, not a dependency tree.
- Reuse EXISTING catalog item ids as outputs (gear/materials) to avoid creating
  unbalanced stats; outputs verified against item-catalog at module load.
