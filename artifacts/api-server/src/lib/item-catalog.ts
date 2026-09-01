import { type ItemRarity, INSTALL_TARGET_TYPES, type InstallTargetType } from "@workspace/db";
import { FIAT_PER_USD } from "./pablo-tax";
import { BATTERY_PRICE_FIAT, GAS_PRODUCT_PRICE_FIAT } from "./utility-catalog";

export { INSTALL_TARGET_TYPES, type InstallTargetType };

/**
 * SALARYMAN item catalog — the master list of RPG gear sold in the Armory.
 *
 * This is the single source of truth for item definitions: type, equip slot,
 * combat stats, and dual-currency pricing. Ownership is persisted in the
 * `player_inventory` / `player_loadout` tables keyed only by `itemId`, so the
 * catalog can evolve freely without a migration.
 *
 * Pricing model (driven by `techTier`):
 *  - Every item has a FIAT price (ƒ) — low-tech gear is cheap, high-tech is
 *    very expensive. FIAT is the in-game currency ($1 = ƒ100).
 *  - Premium high-tech items (tier ≥ 4) ALSO carry a real-money `priceUsd`
 *    so they can be bought with a Stripe card checkout, not just ground out
 *    in FIAT.
 *
 * Combat stats are REAL — see `computeGearStats` + combat-system.ts. The
 * client loads the equipped loadout's effective stats from the server and
 * feeds the exact same numbers into both the stat display and the fight math,
 * so what you see is what you hit with.
 */

export const ITEM_TYPES = [
  "clothes",
  "weapons",
  "armor",
  "furniture",
  "decor",
  "tech",
  "defense",
  "equipment",
  "vehicle",
  // ─── Stackable consumables (foundation for battery/gas/crafting) ──────────
  // These are NOT boolean-ownership gear: they carry a quantity per character
  // slot and some can be installed into a home / vehicle / bot / companion.
  "battery",
  "fuel",
  "material",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// Item types that stack as a quantity rather than being one-time owned gear.
export const CONSUMABLE_TYPES = ["battery", "fuel", "material"] as const satisfies readonly ItemType[];

export const VEHICLE_KINDS = [
  "boat",
  "car",
  "motorcycle",
  "flying_car",
  "tunneler",
  "horse",
  "speeder",
  "animal",
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

// Equip slots. `null` = not equippable (furniture / decor are placed, not worn).
export const EQUIP_SLOTS = [
  "weapon",
  "armor",
  "outfit",
  "tech",
  "defense",
  "vehicle",
  "accessory",
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export interface ItemStats {
  attack?: number;
  defense?: number;
  magic?: number;
  tech?: number;
}

export interface CatalogItem {
  id: string;
  type: ItemType;
  vehicleKind?: VehicleKind;
  name: string;
  blurb: string;
  techTier: 1 | 2 | 3 | 4 | 5;
  rarity: ItemRarity;
  equipSlot: EquipSlot | null;
  stats: ItemStats;
  /** In-game FIAT price (ƒ). Always present. */
  priceFiat: number;
  /** Real-money price in whole USD. Only set for premium high-tech (tier ≥ 4). */
  priceUsd: number | null;
  icon: string;
  /**
   * Stackable consumable: held as a quantity per character slot (not one-time
   * boolean ownership). Buying increments the stack; using/crafting/installing
   * decrements it. Mutually exclusive with `equipSlot` (consumables aren't worn).
   */
  consumable?: boolean;
  /**
   * Target types this consumable can be installed into (home / vehicle / bot /
   * companion). Empty / undefined = holdable + usable but not installable
   * (e.g. crafting materials).
   */
  installTargets?: InstallTargetType[];
  /** Immediate or limited-use benefit applied by POST /items/consume. */
  useEffect?: {
    stamina?: number;
    workIncomePct?: number;
    workIncomeUses?: number;
    skillGrant?: string;
  };
}

// Helper: high-tech premium items derive a real-money price from FIAT but at a
// steep discount vs. the grind price (paying cash should feel premium, not
// punitive). Only tier ≥ 4 items are purchasable with real money.
function premiumUsd(priceFiat: number): number {
  const raw = priceFiat / FIAT_PER_USD; // ƒ → $ at the canonical rate
  return Math.max(5, Math.round(raw * 0.1)); // cash buyers pay ~10% of grind value
}

function premium(item: Omit<CatalogItem, "priceUsd">): CatalogItem {
  return { ...item, priceUsd: premiumUsd(item.priceFiat) };
}

function fiatOnly(item: Omit<CatalogItem, "priceUsd">): CatalogItem {
  return { ...item, priceUsd: null };
}

// Stackable consumable: FIAT-only (real-money buy is out of scope), never
// equippable, always flagged `consumable`. `installTargets` declares which
// targets it can be installed into (empty for pure crafting materials).
function consumable(
  item: Omit<CatalogItem, "priceUsd" | "equipSlot" | "consumable" | "stats"> & {
    installTargets?: InstallTargetType[];
  },
): CatalogItem {
  return {
    ...item,
    equipSlot: null,
    stats: {},
    consumable: true,
    priceUsd: null,
    installTargets: item.installTargets ?? [],
  };
}

export const ITEM_CATALOG: CatalogItem[] = [
  // ─── CLOTHES (outfit slot — modest defense / prestige) ───────────────────
  fiatOnly({ id: "cloth_jumpsuit", type: "clothes", name: "Salaryman Jumpsuit", blurb: "Standard-issue grey work suit.", techTier: 1, rarity: "common", equipSlot: "outfit", stats: { defense: 3 }, priceFiat: 1500, icon: "🧥" }),
  fiatOnly({ id: "cloth_hivis", type: "clothes", name: "Tower Hi-Vis", blurb: "Reflective workwear for active floors.", techTier: 1, rarity: "common", equipSlot: "outfit", stats: { defense: 4 }, priceFiat: 1800, icon: "🦺" }),
  fiatOnly({ id: "cloth_pinstripe", type: "clothes", name: "Pinstripe Suit", blurb: "Looks like middle management.", techTier: 1, rarity: "common", equipSlot: "outfit", stats: { defense: 5 }, priceFiat: 4200, icon: "🤵" }),
  fiatOnly({ id: "cloth_trench", type: "clothes", name: "Wasteland Trenchcoat", blurb: "Weatherproof, pockets everywhere.", techTier: 2, rarity: "expensive", equipSlot: "outfit", stats: { defense: 9, magic: 4 }, priceFiat: 14000, icon: "🧥" }),
  fiatOnly({ id: "cloth_exec", type: "clothes", name: "Executive Power Suit", blurb: "Tailored to intimidate.", techTier: 3, rarity: "rare", equipSlot: "outfit", stats: { defense: 14, magic: 10 }, priceFiat: 55000, icon: "🕴️" }),
  premium({ id: "cloth_nanoweave", type: "clothes", name: "Nanoweave Bodysuit", blurb: "Self-mending smart fabric.", techTier: 4, rarity: "very_rare", equipSlot: "outfit", stats: { defense: 26, tech: 12 }, priceFiat: 220000, icon: "🥋" }),
  premium({ id: "cloth_gold_pinstripe", type: "clothes", name: "Gold Pinstripe (Pablo Cut)", blurb: "You've made it. Everyone knows.", techTier: 5, rarity: "legendary", equipSlot: "outfit", stats: { defense: 30, magic: 24 }, priceFiat: 750000, icon: "🌟" }),
  // ─── DRESSES (outfit slot — wearable by the player AND by Mila) ───────────
  fiatOnly({ id: "cloth_sundress", type: "clothes", name: "Civic Sundress", blurb: "Light cotton. Off-shift wear.", techTier: 1, rarity: "common", equipSlot: "outfit", stats: { defense: 2 }, priceFiat: 1800, icon: "👗" }),
  fiatOnly({ id: "cloth_cocktail", type: "clothes", name: "Cocktail Dress", blurb: "For closing deals after dark.", techTier: 2, rarity: "expensive", equipSlot: "outfit", stats: { defense: 6, magic: 4 }, priceFiat: 16000, icon: "👗" }),
  fiatOnly({ id: "cloth_qipao", type: "clothes", name: "Neon Qipao", blurb: "Silk that catches the streetlight.", techTier: 3, rarity: "rare", equipSlot: "outfit", stats: { defense: 12, magic: 9 }, priceFiat: 52000, icon: "👘" }),
  premium({ id: "cloth_evening_gown", type: "clothes", name: "Evening Gown", blurb: "Floor-length. Boardroom gala standard.", techTier: 4, rarity: "very_rare", equipSlot: "outfit", stats: { defense: 22, magic: 16 }, priceFiat: 240000, icon: "👗" }),
  premium({ id: "cloth_couture_gown", type: "clothes", name: "Couture Gown (Mila Cut)", blurb: "Hand-stitched for a replicant who outclasses the room.", techTier: 5, rarity: "legendary", equipSlot: "outfit", stats: { defense: 28, magic: 26 }, priceFiat: 820000, icon: "💃" }),

  // ─── WEAPONS (weapon slot — attack) ──────────────────────────────────────
  fiatOnly({ id: "wpn_briefcase", type: "weapons", name: "Loaded Briefcase", blurb: "Looks corporate. Isn't.", techTier: 1, rarity: "common", equipSlot: "weapon", stats: { attack: 8 }, priceFiat: 2000, icon: "💼" }),
  fiatOnly({ id: "wpn_bat", type: "weapons", name: "Aluminium Bat", blurb: "Reliable persuasion.", techTier: 1, rarity: "common", equipSlot: "weapon", stats: { attack: 16 }, priceFiat: 5500, icon: "🏏" }),
  fiatOnly({ id: "wpn_katana", type: "weapons", name: "Office Katana", blurb: "Folded steel, folded org chart.", techTier: 2, rarity: "expensive", equipSlot: "weapon", stats: { attack: 34 }, priceFiat: 19000, icon: "🗡️" }),
  fiatOnly({ id: "wpn_smg", type: "weapons", name: "Compact SMG", blurb: "Quarterly results, rapid fire.", techTier: 3, rarity: "rare", equipSlot: "weapon", stats: { attack: 52, tech: 10 }, priceFiat: 72000, icon: "🔫" }),
  premium({ id: "wpn_railgun", type: "weapons", name: "Corporate Railgun", blurb: "Magnetically accelerated downsizing.", techTier: 4, rarity: "very_rare", equipSlot: "weapon", stats: { attack: 90, tech: 24 }, priceFiat: 320000, icon: "⚡" }),
  premium({ id: "wpn_plasma_lance", type: "weapons", name: "Pablo Plasma Lance", blurb: "The boss's personal sidearm.", techTier: 5, rarity: "legendary", equipSlot: "weapon", stats: { attack: 140, magic: 30, tech: 30 }, priceFiat: 1200000, icon: "🔱" }),

  // ─── ARMOR (armor slot — defense) ────────────────────────────────────────
  fiatOnly({ id: "armor_vest", type: "armor", name: "Kevlar Vest", blurb: "Standard street protection.", techTier: 1, rarity: "common", equipSlot: "armor", stats: { defense: 12 }, priceFiat: 6000, icon: "🦺" }),
  fiatOnly({ id: "armor_riot", type: "armor", name: "Riot Plating", blurb: "Heavy, but you'll thank it.", techTier: 2, rarity: "expensive", equipSlot: "armor", stats: { defense: 24 }, priceFiat: 22000, icon: "🛡️" }),
  fiatOnly({ id: "armor_exo", type: "armor", name: "Exo-Frame Carapace", blurb: "Servo-assisted hardshell.", techTier: 3, rarity: "rare", equipSlot: "armor", stats: { defense: 40, tech: 8 }, priceFiat: 88000, icon: "🤖" }),
  premium({ id: "armor_reactive", type: "armor", name: "Reactive Nanoplate", blurb: "Hardens on impact.", techTier: 4, rarity: "very_rare", equipSlot: "armor", stats: { defense: 60, tech: 18 }, priceFiat: 360000, icon: "🛡️" }),
  premium({ id: "armor_aegis", type: "armor", name: "AEGIS Powered Armor", blurb: "Walk into anything.", techTier: 5, rarity: "legendary", equipSlot: "armor", stats: { defense: 95, magic: 20, tech: 25 }, priceFiat: 1400000, icon: "🦾" }),

  // ─── DEFENSE (defense slot — shields / counter-damage) ───────────────────
  fiatOnly({ id: "def_buckler", type: "defense", name: "Folding Buckler", blurb: "Pocket-sized blocker.", techTier: 1, rarity: "common", equipSlot: "defense", stats: { defense: 8 }, priceFiat: 3000, icon: "🛡️" }),
  fiatOnly({ id: "def_riot_shield", type: "defense", name: "Riot Shield", blurb: "Crowd-control classic.", techTier: 2, rarity: "expensive", equipSlot: "defense", stats: { defense: 18 }, priceFiat: 16000, icon: "🛡️" }),
  fiatOnly({ id: "def_energy_barrier", type: "defense", name: "Energy Barrier Emitter", blurb: "Hum of safety.", techTier: 3, rarity: "rare", equipSlot: "defense", stats: { defense: 30, tech: 12 }, priceFiat: 64000, icon: "🔆" }),
  premium({ id: "def_deflector", type: "defense", name: "Phase Deflector", blurb: "Bends incoming rounds away.", techTier: 4, rarity: "very_rare", equipSlot: "defense", stats: { defense: 48, magic: 16 }, priceFiat: 300000, icon: "🌀" }),
  premium({ id: "def_aegis_dome", type: "defense", name: "AEGIS Dome", blurb: "A bubble nothing gets through.", techTier: 5, rarity: "legendary", equipSlot: "defense", stats: { defense: 80, magic: 24, tech: 24 }, priceFiat: 1100000, icon: "⛨" }),

  // ─── TECH (tech slot — ranged power / utility) ───────────────────────────
  fiatOnly({ id: "tech_visor", type: "tech", name: "Targeting Visor", blurb: "Paints what you point at.", techTier: 1, rarity: "common", equipSlot: "tech", stats: { tech: 10 }, priceFiat: 4000, icon: "🥽" }),
  fiatOnly({ id: "tech_drone", type: "tech", name: "Recon Drone", blurb: "Eyes in the sky.", techTier: 2, rarity: "expensive", equipSlot: "tech", stats: { tech: 22, attack: 6 }, priceFiat: 18000, icon: "🛸" }),
  fiatOnly({ id: "tech_neural", type: "tech", name: "Neural Co-Processor", blurb: "Faster than thought.", techTier: 3, rarity: "rare", equipSlot: "tech", stats: { tech: 38, magic: 10 }, priceFiat: 70000, icon: "🧠" }),
  premium({ id: "tech_quantum", type: "tech", name: "Quantum Aim Core", blurb: "Computes the perfect shot.", techTier: 4, rarity: "very_rare", equipSlot: "tech", stats: { tech: 60, attack: 18 }, priceFiat: 340000, icon: "🧬" }),
  premium({ id: "tech_oracle", type: "tech", name: "PABLO Oracle Implant", blurb: "Sees the fight before it starts.", techTier: 5, rarity: "legendary", equipSlot: "tech", stats: { tech: 95, magic: 30, attack: 24 }, priceFiat: 1300000, icon: "👁️" }),

  // ─── EQUIPMENT (accessory slot — mixed utility) ──────────────────────────
  fiatOnly({ id: "equip_hardhat", type: "equipment", name: "Impact Hard Hat", blurb: "Rated for construction and maintenance floors.", techTier: 1, rarity: "common", equipSlot: "accessory", stats: { defense: 5 }, priceFiat: 1200, icon: "⛑️" }),
  fiatOnly({ id: "equip_workgloves", type: "equipment", name: "Work Gloves", blurb: "Grip and hand protection for building work.", techTier: 1, rarity: "common", equipSlot: "accessory", stats: { defense: 2 }, priceFiat: 700, icon: "🧤" }),
  fiatOnly({ id: "equip_gasmask", type: "equipment", name: "Corporate Gasmask", blurb: "Breathe through the fog.", techTier: 1, rarity: "common", equipSlot: "accessory", stats: { defense: 6 }, priceFiat: 5000, icon: "😷" }),
  fiatOnly({ id: "equip_grapple", type: "equipment", name: "Grapple Gauntlet", blurb: "Reach the high ledges.", techTier: 2, rarity: "expensive", equipSlot: "accessory", stats: { attack: 8, tech: 8 }, priceFiat: 17000, icon: "🪝" }),
  fiatOnly({ id: "equip_medkit", type: "equipment", name: "Auto-Medkit Rig", blurb: "Patches you mid-fight.", techTier: 3, rarity: "rare", equipSlot: "accessory", stats: { defense: 18, magic: 8 }, priceFiat: 60000, icon: "💉" }),
  premium({ id: "equip_jetpack", type: "equipment", name: "Compact Jetpack", blurb: "Leave the ground problems.", techTier: 4, rarity: "very_rare", equipSlot: "accessory", stats: { defense: 20, tech: 28 }, priceFiat: 280000, icon: "🚀" }),
  premium({ id: "equip_exorig", type: "equipment", name: "PABLO Exo-Rig", blurb: "Strength of ten salarymen.", techTier: 5, rarity: "legendary", equipSlot: "accessory", stats: { attack: 40, defense: 40, tech: 20 }, priceFiat: 1000000, icon: "🦿" }),

  // ─── FURNITURE (placed — not equippable; office buffs as flavor) ─────────
  fiatOnly({ id: "furn_desk", type: "furniture", name: "Standing Desk", blurb: "Ergonomic and expensive.", techTier: 1, rarity: "common", equipSlot: null, stats: {}, priceFiat: 3500, icon: "🪑" }),
  fiatOnly({ id: "furn_couch", type: "furniture", name: "Leather Couch", blurb: "Close deals in comfort.", techTier: 1, rarity: "common", equipSlot: null, stats: {}, priceFiat: 8000, icon: "🛋️" }),
  fiatOnly({ id: "furn_boardroom", type: "furniture", name: "Glass Boardroom Table", blurb: "Power radiates from it.", techTier: 2, rarity: "expensive", equipSlot: null, stats: {}, priceFiat: 26000, icon: "🪟" }),
  fiatOnly({ id: "furn_server_rack", type: "furniture", name: "Private Server Rack", blurb: "Your own metal.", techTier: 3, rarity: "rare", equipSlot: null, stats: {}, priceFiat: 75000, icon: "🖥️" }),

  // ─── DECOR (placed — not equippable; flex) ───────────────────────────────
  fiatOnly({ id: "decor_neon", type: "decor", name: "Neon Sign Pack", blurb: "Light up your HQ.", techTier: 1, rarity: "common", equipSlot: null, stats: {}, priceFiat: 4500, icon: "🌃" }),
  fiatOnly({ id: "decor_plant", type: "decor", name: "Brass Monstera", blurb: "Tasteful greenery.", techTier: 1, rarity: "common", equipSlot: null, stats: {}, priceFiat: 6000, icon: "🪴" }),
  fiatOnly({ id: "decor_aquarium", type: "decor", name: "Shark Aquarium", blurb: "Subtle.", techTier: 2, rarity: "expensive", equipSlot: null, stats: {}, priceFiat: 34000, icon: "🦈" }),
  premium({ id: "decor_hologlobe", type: "decor", name: "Holographic City Globe", blurb: "The whole map, spinning.", techTier: 4, rarity: "very_rare", equipSlot: null, stats: {}, priceFiat: 180000, icon: "🌐" }),

  // ─── VEHICLES (vehicle slot — mobility; some carry defense/tech) ─────────
  fiatOnly({ id: "veh_horse", type: "vehicle", vehicleKind: "horse", name: "City Horse", blurb: "Old-world commute.", techTier: 1, rarity: "common", equipSlot: "vehicle", stats: {}, priceFiat: 9000, icon: "🐎" }),
  fiatOnly({ id: "veh_motorcycle", type: "vehicle", vehicleKind: "motorcycle", name: "Street Motorcycle", blurb: "Split the traffic.", techTier: 2, rarity: "expensive", equipSlot: "vehicle", stats: { defense: 4 }, priceFiat: 28000, icon: "🏍️" }),
  fiatOnly({ id: "veh_car", type: "vehicle", vehicleKind: "car", name: "Sedan", blurb: "Reliable four-door.", techTier: 2, rarity: "expensive", equipSlot: "vehicle", stats: { defense: 8 }, priceFiat: 40000, icon: "🚗" }),
  fiatOnly({ id: "veh_boat", type: "vehicle", vehicleKind: "boat", name: "Speedboat", blurb: "Own the river.", techTier: 3, rarity: "rare", equipSlot: "vehicle", stats: { defense: 6, tech: 6 }, priceFiat: 95000, icon: "🚤" }),
  fiatOnly({ id: "veh_animal", type: "vehicle", vehicleKind: "animal", name: "Armored Mastiff", blurb: "Ride or guard.", techTier: 3, rarity: "rare", equipSlot: "vehicle", stats: { attack: 12, defense: 10 }, priceFiat: 78000, icon: "🐕" }),
  premium({ id: "veh_speeder", type: "vehicle", vehicleKind: "speeder", name: "Hover Speeder", blurb: "Anti-grav and angry.", techTier: 4, rarity: "very_rare", equipSlot: "vehicle", stats: { defense: 14, tech: 18 }, priceFiat: 260000, icon: "🛵" }),
  premium({ id: "veh_tunneler", type: "vehicle", vehicleKind: "tunneler", name: "Subterra Tunneler", blurb: "Make your own roads.", techTier: 4, rarity: "very_rare", equipSlot: "vehicle", stats: { defense: 22, tech: 20 }, priceFiat: 380000, icon: "🛞" }),
  premium({ id: "veh_flying_car", type: "vehicle", vehicleKind: "flying_car", name: "PABLO Flying Car", blurb: "Skip the city entirely.", techTier: 5, rarity: "legendary", equipSlot: "vehicle", stats: { defense: 36, magic: 12, tech: 30 }, priceFiat: 900000, icon: "🚁" }),

  // ─── BATTERIES (stackable; install into home / vehicle / bot / companion) ──
  // Powered slots accept these. The charge/metering loop is a separate task —
  // here they're just stackable, installable consumables.
  // Battery prices are sourced from utility-catalog (PABLO POWER & GAS) so the
  // shop price and the energy loop's capacity numbers never drift apart.
  consumable({ id: "batt_aa", type: "battery", name: "AA Cell Pack", blurb: "Cheap juice for small loads.", techTier: 1, rarity: "common", priceFiat: BATTERY_PRICE_FIAT["batt_aa"], icon: "🔋", installTargets: ["home", "vehicle", "bot", "companion", "assistant"] }),
  consumable({ id: "batt_cell", type: "battery", name: "Power Cell", blurb: "Standard rechargeable cell.", techTier: 2, rarity: "expensive", priceFiat: BATTERY_PRICE_FIAT["batt_cell"], icon: "🔋", installTargets: ["home", "vehicle", "bot", "companion", "assistant"] }),
  consumable({ id: "batt_fusion", type: "battery", name: "Micro-Fusion Core", blurb: "Runs hot, runs long.", techTier: 4, rarity: "very_rare", priceFiat: BATTERY_PRICE_FIAT["batt_fusion"], icon: "⚛️", installTargets: ["home", "vehicle", "bot", "companion", "assistant"] }),

  // ─── FUEL (stackable; install into a vehicle's tank slot) ─────────────────
  // Pump prices also flow from utility-catalog — gas is a PABLO POWER & GAS good.
  consumable({ id: "fuel_gas_can", type: "fuel", name: "Gas Can", blurb: "Five gallons of go.", techTier: 1, rarity: "common", priceFiat: GAS_PRODUCT_PRICE_FIAT["fuel_gas_can"], icon: "⛽", installTargets: ["vehicle"] }),
  consumable({ id: "fuel_diesel", type: "fuel", name: "Diesel Drum", blurb: "For the heavy haulers.", techTier: 2, rarity: "expensive", priceFiat: GAS_PRODUCT_PRICE_FIAT["fuel_diesel"], icon: "🛢️", installTargets: ["vehicle"] }),

  // ─── MATERIALS (stackable crafting stock; not installable) ────────────────
  consumable({ id: "mat_scrap", type: "material", name: "Scrap Metal", blurb: "Salvaged feedstock.", techTier: 1, rarity: "common", priceFiat: 300, icon: "🔩" }),
  consumable({ id: "mat_copper", type: "material", name: "Copper Wire Spool", blurb: "Conducts everything.", techTier: 1, rarity: "common", priceFiat: 700, icon: "🧵" }),
  consumable({ id: "mat_silicon", type: "material", name: "Silicon Wafer", blurb: "Brains in waiting.", techTier: 2, rarity: "expensive", priceFiat: 3200, icon: "💾" }),
  consumable({ id: "vend_shift_tonic", type: "material", name: "Shift Tonic", blurb: "Restores 30 stamina for another working block.", techTier: 1, rarity: "common", priceFiat: 35000, icon: "🥤", useEffect: { stamina: 30 } }),
  consumable({ id: "vend_foreman_meal", type: "material", name: "Foreman Meal", blurb: "Restores 70 stamina. Dense, hot, and built for overtime.", techTier: 1, rarity: "expensive", priceFiat: 80000, icon: "🍱", useEffect: { stamina: 70 } }),
  consumable({ id: "vend_interview_drill", type: "material", name: "Interview Drill Set", blurb: "Practice scripts and role drills. +25% income on your next 3 jobs.", techTier: 2, rarity: "rare", priceFiat: 450000, icon: "🎙️", useEffect: { workIncomePct: 25, workIncomeUses: 3, skillGrant: "career.interview_prepared" } }),
  consumable({ id: "vend_trade_cert", type: "material", name: "Certified Trade Course", blurb: "Practical work training. +50% income on your next 5 jobs.", techTier: 3, rarity: "very_rare", priceFiat: 900000, icon: "📐", useEffect: { workIncomePct: 50, workIncomeUses: 5, skillGrant: "work.trade_certified" } }),
];

export const PUBLIC_VENDING_ITEM_IDS = [
  "equip_hardhat",
  "equip_gasmask",
  "vend_shift_tonic",
  "vend_foreman_meal",
  "vend_interview_drill",
  "vend_trade_cert",
] as const;

export function requiresPhysicalBlackMarket(item: CatalogItem): boolean {
  return item.type === "weapons" || item.type === "armor" || item.type === "defense" || (item.stats.attack ?? 0) > 0;
}

const BY_ID = new Map(ITEM_CATALOG.map((i) => [i.id, i]));

export function findCatalogItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

export type EquipSlotMap = Partial<Record<EquipSlot, string>>;

/**
 * Resolve the equipped loadout's combined combat stats. This is THE resolver —
 * both the Armory stat display and the in-world combat math consume its output
 * so displayed numbers and fight outcomes can never diverge. Unknown ids and
 * non-equippable items contribute nothing.
 */
export function computeGearStats(equippedItemIds: string[]): Required<ItemStats> {
  const total = { attack: 0, defense: 0, magic: 0, tech: 0 };
  for (const id of equippedItemIds) {
    const it = BY_ID.get(id);
    if (!it || it.equipSlot === null) continue;
    total.attack += it.stats.attack ?? 0;
    total.defense += it.stats.defense ?? 0;
    total.magic += it.stats.magic ?? 0;
    total.tech += it.stats.tech ?? 0;
  }
  return total;
}

// ─── Consumable / install helpers ────────────────────────────────────────────

/** True if the catalog item stacks as a quantity rather than boolean ownership. */
export function isConsumable(item: CatalogItem): boolean {
  return item.consumable === true;
}

/** Can this consumable be installed into the given target type? */
export function canInstallInto(item: CatalogItem, targetType: InstallTargetType): boolean {
  return isConsumable(item) && (item.installTargets?.includes(targetType) ?? false);
}
