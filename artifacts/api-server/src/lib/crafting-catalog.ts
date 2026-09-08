// ── Crafting Catalog ──────────────────────────────────────────────────────
// The authoritative, faction-agnostic set of crafting recipes. Crafting turns
// harvested resources (resource-catalog → resource_inventory) and stackable
// material consumables (item-catalog type "material" → player_inventory) into
// useful output items.
//
// HARD RULE — utility monopoly: batteries, fuel/gas and electricity are
// produced only by Pablo's utility company and are NEVER craftable. Any recipe
// whose output is a battery/fuel item is rejected at module load (see the
// assertion at the bottom) and guarded again server-side at craft time.
//
// Recipes are intentionally FLAT (no tech-tree / skill gating): each recipe is
// inputs → one output. The two-layer shape (refine resources into materials,
// then build gear from materials) is a natural flow, not an unlock tree.

import { findCatalogItem, CONSUMABLE_TYPES } from "./item-catalog";
import { getResourceDef } from "./resource-catalog";

// A single recipe input. `resource` draws from the harvested resource ledger
// (resource_inventory); `item` draws from a stackable material consumable in
// the carried inventory (player_inventory).
export type CraftInputKind = "resource" | "item";
export interface CraftInput {
  kind: CraftInputKind;
  id: string;
  qty: number;
}

export type CraftCategory = "refine" | "gear";

export interface CraftRecipe {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  category: CraftCategory;
  inputs: CraftInput[];
  /** The catalog item produced and the quantity granted (qty matters for
   *  stackable consumable outputs; boolean gear is always granted as 1). */
  output: { itemId: string; qty: number };
}

export const CRAFT_RECIPES: readonly CraftRecipe[] = [
  // ─── REFINE: harvested resources → stackable crafting materials ───────────
  {
    id: "refine_scrap",
    name: "Smelt Scrap Metal",
    blurb: "Melt down salvaged iron into clean, stackable feedstock.",
    icon: "🔩",
    category: "refine",
    inputs: [{ kind: "resource", id: "iron_scrap", qty: 3 }],
    output: { itemId: "mat_scrap", qty: 2 },
  },
  {
    id: "refine_scrap_waste",
    name: "Reclaim Waste Iron",
    blurb: "Even wasteland wreckage smelts down into usable scrap.",
    icon: "⚙️",
    category: "refine",
    inputs: [{ kind: "resource", id: "waste_iron", qty: 4 }],
    output: { itemId: "mat_scrap", qty: 2 },
  },
  {
    id: "refine_copper",
    name: "Spool Copper Wire",
    blurb: "Draw raw copper and salvage into conductive wire spools.",
    icon: "🧵",
    category: "refine",
    inputs: [
      { kind: "resource", id: "copper_vein", qty: 2 },
      { kind: "resource", id: "copper_scrap", qty: 2 },
    ],
    output: { itemId: "mat_copper", qty: 2 },
  },
  {
    id: "refine_silicon",
    name: "Etch Silicon Wafer",
    blurb: "Refine sediment and darkstone into a doped silicon wafer.",
    icon: "💾",
    category: "refine",
    inputs: [
      { kind: "resource", id: "silt_ore", qty: 2 },
      { kind: "resource", id: "darkstone", qty: 1 },
    ],
    output: { itemId: "mat_silicon", qty: 1 },
  },

  // ─── GEAR: materials (+ raw resources) → useful equipment ─────────────────
  {
    id: "craft_gasmask",
    name: "Assemble Corporate Gasmask",
    blurb: "Scrap and resin seals into a fog-rated breathing mask.",
    icon: "😷",
    category: "gear",
    inputs: [
      { kind: "item", id: "mat_scrap", qty: 2 },
      { kind: "resource", id: "resin_shard", qty: 1 },
    ],
    output: { itemId: "equip_gasmask", qty: 1 },
  },
  {
    id: "craft_buckler",
    name: "Forge Folding Buckler",
    blurb: "Hammer scrap into a pocket-sized blocking shield.",
    icon: "🛡️",
    category: "gear",
    inputs: [{ kind: "item", id: "mat_scrap", qty: 3 }],
    output: { itemId: "def_buckler", qty: 1 },
  },
  {
    id: "craft_bat",
    name: "Weld Aluminium Bat",
    blurb: "Reliable persuasion, welded from refined scrap.",
    icon: "🏏",
    category: "gear",
    inputs: [{ kind: "item", id: "mat_scrap", qty: 2 }],
    output: { itemId: "wpn_bat", qty: 1 },
  },
  {
    id: "craft_vest",
    name: "Stitch Kevlar Vest",
    blurb: "Layer scrap plating and iron into street protection.",
    icon: "🦺",
    category: "gear",
    inputs: [
      { kind: "item", id: "mat_scrap", qty: 4 },
      { kind: "resource", id: "iron_scrap", qty: 2 },
    ],
    output: { itemId: "armor_vest", qty: 1 },
  },
  {
    id: "craft_visor",
    name: "Build Targeting Visor",
    blurb: "Wire copper and a silicon wafer into a targeting HUD.",
    icon: "🥽",
    category: "gear",
    inputs: [
      { kind: "item", id: "mat_copper", qty: 2 },
      { kind: "item", id: "mat_silicon", qty: 1 },
    ],
    output: { itemId: "tech_visor", qty: 1 },
  },
];

const BY_ID = new Map(CRAFT_RECIPES.map((r) => [r.id, r]));

export function getCraftRecipe(id: string): CraftRecipe | undefined {
  return BY_ID.get(id);
}

// Quantities the player currently holds, split by source ledger. Used by the
// pure availability check below so the gameplay logic is testable without a DB.
export interface CraftAvailability {
  resources: Record<string, number>;
  items: Record<string, number>;
}

export interface MissingInput extends CraftInput {
  have: number;
}

/** Pure check: which inputs (if any) the player is short on for this recipe. */
export function computeMissingInputs(recipe: CraftRecipe, avail: CraftAvailability): MissingInput[] {
  const missing: MissingInput[] = [];
  for (const inp of recipe.inputs) {
    const have = (inp.kind === "resource" ? avail.resources[inp.id] : avail.items[inp.id]) ?? 0;
    if (have < inp.qty) missing.push({ ...inp, have });
  }
  return missing;
}

/** True if every input requirement is met. */
export function canCraft(recipe: CraftRecipe, avail: CraftAvailability): boolean {
  return computeMissingInputs(recipe, avail).length === 0;
}

/** A craftable output must never be a utility good (battery / fuel / gas). */
export function isUtilityOutput(itemId: string): boolean {
  const item = findCatalogItem(itemId);
  if (!item) return false;
  return item.type === "battery" || item.type === "fuel";
}

// ── Integrity guards (fail fast at module load) ──────────────────────────────
// Every recipe must reference real inputs/outputs and must NOT produce a utility
// good. A typo or an accidental battery/gas output is a load-time crash, not a
// silent runtime bug.
for (const r of CRAFT_RECIPES) {
  const out = findCatalogItem(r.output.itemId);
  if (!out) throw new Error(`[crafting] recipe ${r.id} outputs unknown item ${r.output.itemId}`);
  if (isUtilityOutput(r.output.itemId)) {
    throw new Error(`[crafting] recipe ${r.id} outputs utility good ${r.output.itemId} — utilities are monopoly-only and not craftable`);
  }
  if (r.output.qty < 1) throw new Error(`[crafting] recipe ${r.id} has non-positive output qty`);
  for (const inp of r.inputs) {
    if (inp.qty < 1) throw new Error(`[crafting] recipe ${r.id} input ${inp.id} has non-positive qty`);
    if (inp.kind === "resource") {
      if (!getResourceDef(inp.id)) throw new Error(`[crafting] recipe ${r.id} needs unknown resource ${inp.id}`);
    } else {
      const it = findCatalogItem(inp.id);
      if (!it) throw new Error(`[crafting] recipe ${r.id} needs unknown item ${inp.id}`);
      if (!(CONSUMABLE_TYPES as readonly string[]).includes(it.type)) {
        throw new Error(`[crafting] recipe ${r.id} input ${inp.id} is not a stackable consumable material`);
      }
    }
  }
}
