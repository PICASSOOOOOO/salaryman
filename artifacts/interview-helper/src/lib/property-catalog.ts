// Property renovation catalog — the authored data + cost math behind the
// "renovate a property you own" flow in the realty showroom (RealtyStore).
//
// Renovation lets an owner re-skin a property they hold: a paint/accent swatch
// (theme color), an optional signage label, and a lighting mood. None of these
// change the property's footprint or tier — they're cosmetic — so they cost a
// flat ƒ LABOR fee rather than a market-scaled price. Labor scales with the
// property's interior tier (a capsule is a one-day job; a suite/tower takes a
// full crew the better part of a work-week).
//
// The SERVER owns the authoritative labor charge (see /api/real-estate/renovate)
// — these same constants are mirrored there so a tampered client can't renovate
// a tower for ƒ1. This module is the client mirror used purely for display +
// the picker UI.

import type { SalarymanOfficeTier } from "./tutorial-progress";

export type LightingMood = "dim" | "normal" | "bright";

export interface RenovationSwatch {
  id: string;
  name: string;
  hex: string; // accent / theme color applied to banners + interior lighting
}

export interface LightingOption {
  id: LightingMood;
  name: string;
  blurb: string;
}

// Curated high-contrast accent palette — mirrors THEME_COLOR_PRESETS in
// gameSystems so a renovated banner reads cleanly against the carpet floor.
export const RENOVATION_SWATCHES: RenovationSwatch[] = [
  { id: "cyan",    name: "CYAN",    hex: "#38bdf8" },
  { id: "amber",   name: "AMBER",   hex: "#fbbf24" },
  { id: "emerald", name: "EMERALD", hex: "#10b981" },
  { id: "magenta", name: "MAGENTA", hex: "#d946ef" },
  { id: "crimson", name: "CRIMSON", hex: "#ef4444" },
  { id: "gold",    name: "GOLD",    hex: "#ffcc00" },
  { id: "violet",  name: "VIOLET",  hex: "#8b5cf6" },
  { id: "white",   name: "WHITE",   hex: "#e6e6e6" },
];

export const LIGHTING_OPTIONS: LightingOption[] = [
  { id: "dim",    name: "DIM",    blurb: "Low ambient — moody noir, cheaper power." },
  { id: "normal", name: "NORMAL", blurb: "Balanced overheads. The default." },
  { id: "bright", name: "BRIGHT", blurb: "Full daylight panels — higher power draw." },
];

export const MAX_SIGNAGE_LEN = 18;

// ── Labor cost math ──────────────────────────────────────────────────────────
// A renovation is priced as (crew-days × ƒ per crew-day). Crew size/length is a
// function of the interior tier, NOT the BTC market — renovation is local labor,
// so the price is deterministic.
export const LABOR_FIAT_PER_CREW_DAY = 2_500;

const TIER_CREW_DAYS: Record<SalarymanOfficeTier, number> = {
  capsule: 1,
  studio: 2,
  coworking: 4,
  suite: 8,
};

/** How many crew-days a renovation of this interior tier takes. */
export function renovationCrewDays(tier: SalarymanOfficeTier): number {
  return TIER_CREW_DAYS[tier] ?? 2;
}

/** Flat ƒ LABOR cost to renovate a property of this interior tier. */
export function renovationLaborCost(tier: SalarymanOfficeTier): number {
  return renovationCrewDays(tier) * LABOR_FIAT_PER_CREW_DAY;
}

/** True if `hex` is one of the curated swatches (validation parity w/ server). */
export function isValidSwatchHex(hex: string): boolean {
  return RENOVATION_SWATCHES.some((s) => s.hex.toLowerCase() === String(hex).toLowerCase());
}

/** True if `id` is a valid lighting mood. */
export function isValidLighting(id: string): id is LightingMood {
  return LIGHTING_OPTIONS.some((o) => o.id === id);
}

// ── Onboarding debt math ──────────────────────────────────────────────────────
// Shared between the onboarding estate step (PabloOnboarding) and any
// post-onboarding housing-upgrade surface so both always show the same numbers.

/** FIAT a normal player arrives with on day one (bank seed). */
export const ONBOARDING_STARTING_FIAT = 200_000;

/**
 * Returns whether choosing a tier at the given monthly price puts the player
 * in day-one debt, and by how much.
 */
export function computeOnboardingDebt(tierPrice: number): {
  inDebt: boolean;
  shortfall: number;
} {
  const inDebt = ONBOARDING_STARTING_FIAT < tierPrice;
  return { inDebt, shortfall: Math.max(0, tierPrice - ONBOARDING_STARTING_FIAT) };
}

// ── Faction- & location-based property catalogs ──────────────────────────────
// At onboarding the player picks a FACTION (SUITS / NOMADS / REPLICANTS), and
// each faction lives in a different district of the world. The realty showroom
// and the onboarding housing step both surface a catalog that is THEMED to the
// player's faction/district — a suit shops glass towers in the Corporate Core,
// a nomad picks salvage rigs out in the Wastes, a replicant takes a charging
// cell in the Foundry.
//
// IMPORTANT: every faction's catalog maps onto the SAME underlying artKeys,
// tiers, stats and prices. Only the presentation (name / district / blurb /
// perks) changes per faction. This keeps the SERVER the single source of truth
// for pricing (it validates by artKey, faction-blind) and keeps the existing
// realty purchase + renovation flow byte-identical — we're gating WHAT a player
// sees, not building a parallel purchase mechanic.

export type Faction = "suit" | "nomad" | "replicant";

export interface FactionDistrict {
  faction: Faction;
  factionLabel: string; // SUITS / NOMADS / REPLICANTS
  district: string; // CORPORATE CORE / THE WASTES / THE FOUNDRY
  districtKana: string; // small katakana/kanji flavour label
  locationBlurb: string; // one line on where this faction lives
  accent: string; // hex accent color for the district header
}

export const FACTION_DISTRICTS: Record<Faction, FactionDistrict> = {
  suit: {
    faction: "suit",
    factionLabel: "SUITS",
    district: "CORPORATE CORE",
    districtKana: "中枢",
    locationBlurb:
      "PABLO CORP's glass-and-chrome downtown. Clean towers, concierge floors, and addresses that open doors.",
    accent: "#38bdf8",
  },
  nomad: {
    faction: "nomad",
    factionLabel: "NOMADS",
    district: "THE WASTES",
    districtKana: "荒野",
    locationBlurb:
      "Beyond the wall. Salvaged blocks, off-grid bunkers, and rigs you wire yourself. No landlord, no registry.",
    accent: "#f59e0b",
  },
  replicant: {
    faction: "replicant",
    factionLabel: "REPLICANTS",
    district: "THE FOUNDRY",
    districtKana: "鋳造",
    locationBlurb:
      "The synthetic quarter. Charging docks, server-warm lofts, and optimized cells built for those who don't sleep.",
    accent: "#a855f7",
  },
};

/** Coerce a loose registry value (meta.faction can be null/garbage) to a valid
 *  faction, defaulting to SUITS — the corporate baseline every player can use. */
export function factionFromValue(v: unknown): Faction {
  return v === "nomad" || v === "replicant" ? v : "suit";
}

export type PropertyKind = "home" | "office";

export interface PropertyTemplate {
  artKey: string;
  kind: PropertyKind;
  name: string;
  kana: string; // small katakana label for the Akira flavour
  blurb: string;
  monthlyRent: number; // ƒ / month before market multiplier
  badge: string;
  desks?: number;
  userLimit: number;
  terminals: number;
  perks: string[];
  sqft: number;
}

// Shared numeric backbone for each property slot — artKey, tier stats and the
// authoritative monthly rent (the SERVER prices the same artKeys, so these must
// not drift per faction).
interface PropertySlot {
  artKey: string;
  kind: PropertyKind;
  monthlyRent: number;
  userLimit: number;
  terminals: number;
  desks?: number;
  sqft: number;
}

// Per-faction copy for a slot. Only presentation — never stats or price.
interface PropertySkin {
  name: string;
  kana: string;
  blurb: string;
  badge: string;
  perks: string[];
}

const HOME_SLOTS: PropertySlot[] = [
  { artKey: "property_loft", kind: "home", monthlyRent: 10_000, userLimit: 1, terminals: 1, sqft: 320 },
  { artKey: "property_studio", kind: "home", monthlyRent: 22_000, userLimit: 2, terminals: 1, sqft: 540 },
  { artKey: "property_townhouse", kind: "home", monthlyRent: 55_000, userLimit: 4, terminals: 2, sqft: 1450 },
  { artKey: "property_penthouse", kind: "home", monthlyRent: 180_000, userLimit: 6, terminals: 3, sqft: 3200 },
  { artKey: "property_sky_villa", kind: "home", monthlyRent: 450_000, userLimit: 12, terminals: 6, sqft: 7400 },
];

const OFFICE_SLOTS: PropertySlot[] = [
  { artKey: "property_apartment_office", kind: "office", monthlyRent: 10_000, desks: 3, userLimit: 4, terminals: 2, sqft: 720 },
  { artKey: "property_coworking_suite", kind: "office", monthlyRent: 28_000, desks: 8, userLimit: 10, terminals: 4, sqft: 1300 },
  { artKey: "property_corner_office", kind: "office", monthlyRent: 80_000, desks: 18, userLimit: 22, terminals: 8, sqft: 2200 },
  { artKey: "property_warehouse", kind: "office", monthlyRent: 160_000, desks: 40, userLimit: 48, terminals: 16, sqft: 6800 },
  { artKey: "property_hq_floor", kind: "office", monthlyRent: 400_000, desks: 120, userLimit: 140, terminals: 40, sqft: 18_500 },
  { artKey: "property_tower", kind: "office", monthlyRent: 1_200_000, desks: 480, userLimit: 600, terminals: 160, sqft: 120_000 },
  { artKey: "property_campus", kind: "office", monthlyRent: 4_000_000, desks: 1800, userLimit: 2400, terminals: 600, sqft: 540_000 },
];

// artKey → per-faction skin. Every artKey above MUST have an entry for all three
// factions (enforced by getFactionPropertyCatalog falling back to the suit skin
// only as a defensive guard — keep these complete).
const PROPERTY_SKINS: Record<Faction, Record<string, PropertySkin>> = {
  suit: {
    property_loft: { name: "STARTER LOFT", kana: "スターター", blurb: "One room, one window, no commute. Where every founding story actually starts.", badge: "ENTRY", perks: ["Solo terminal", "Murphy bed", "Hot plate", "Ground-floor mail slot"] },
    property_studio: { name: "MIDTOWN STUDIO", kana: "ミッドタウン", blurb: "Real bedroom, real shower, decent view of the noodle cart on 7th. Quiet enough to think.", badge: "STANDARD", perks: ["Private terminal nook", "Full bath", "Quiet floor", "Roof access"] },
    property_townhouse: { name: "FAMILY TOWNHOUSE", kana: "タウンハウス", blurb: "Three floors, your own door. The neighbours nod and mind their business.", badge: "FAMILY", perks: ["2 networked terminals", "Garage", "Backyard plot", "School zone"] },
    property_penthouse: { name: "EXECUTIVE PENTHOUSE", kana: "ペントハウス", blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a card — they already know.", badge: "ELITE", perks: ["3 terminals + war room", "Concierge", "Helipad access", "Sky garden"] },
    property_sky_villa: { name: "SKY VILLA", kana: "スカイ・ヴィラ", blurb: "Above the cloud layer. The whole city is just a lighting effect from up here.", badge: "ULTRA", perks: ["6 terminals + screening room", "Private elevator", "Onsen deck", "Drone bay"] },
    property_apartment_office: { name: "APARTMENT OFFICE", kana: "アパートメント", blurb: "A 2-bedroom on the 14th floor of a residential block — desks against the windows, kettle always on.", badge: "ENTRY", perks: ["3 desks · 2 terminals", "Residential building", "Kitchenette", "Discreet door"] },
    property_coworking_suite: { name: "CO-WORKING SUITE", kana: "コワーキング", blurb: "Glass-walled suite inside a co-working tower. Reception & wifi included; meetings on the hour.", badge: "STARTUP", perks: ["8 desks · 4 terminals", "Reception included", "Phone booths", "Roof terrace"] },
    property_corner_office: { name: "CORNER OFFICE", kana: "コーナー", blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.", badge: "EXEC", perks: ["18 desks · 8 terminals", "Glass on two walls", "Espresso bar", "Door that locks"] },
    property_warehouse: { name: "OPERATIONS WAREHOUSE", kana: "ウェアハウス", blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.", badge: "OPS", perks: ["40 desks · 16 terminals", "Loading dock", "Bot-tube hookups", "Heavy-amp power"] },
    property_hq_floor: { name: "HEADQUARTERS FLOOR", kana: "ヘッドクォーター", blurb: "A whole floor of a glass tower. Reception, war rooms, server closets, the works.", badge: "HQ", perks: ["120 desks · 40 terminals", "Reception + lobby", "8 war rooms", "On-site server closet"] },
    property_tower: { name: "PRIVATE TOWER", kana: "プライベート・タワー", blurb: "Your name on the lobby. Twelve floors, a cafeteria, helipad on top. The org takes the whole stack.", badge: "TOWER", perks: ["480 desks · 160 terminals", "12 floors", "Cafeteria + gym", "Helipad"] },
    property_campus: { name: "CORPORATE CAMPUS", kana: "コーポレート・キャンパス", blurb: "Three towers around a koi pond. Self-driving shuttles between buildings. A small sovereign nation.", badge: "CAMPUS", perks: ["1,800 desks · 600 terminals", "3 towers", "Shuttles + koi pond", "Sub-orbital pad"] },
  },
  nomad: {
    property_loft: { name: "SCRAP BERTH", kana: "スクラップ", blurb: "A welded container with a cot and a stolen terminal. Off the grid, off the books.", badge: "SALVAGE", perks: ["Jury-rigged terminal", "Cot + footlocker", "Camp stove", "No registry trail"] },
    property_studio: { name: "SANDLOT RIG", kana: "サンドロット", blurb: "Two containers stacked, a tarp porch, a generator that mostly holds. Nobody's landlord but yours.", badge: "OFF-GRID", perks: ["Patched terminal", "Generator power", "Rain catch", "Lookout perch"] },
    property_townhouse: { name: "BUNKER HOLD", kana: "バンカー", blurb: "A reinforced sub-grade hold beyond the wall. Three blast doors between you and the dust.", badge: "FORTIFIED", perks: ["2 hardened terminals", "Blast doors", "Water cistern", "Hidden cache"] },
    property_penthouse: { name: "WARLORD'S ROOST", kana: "ルースト", blurb: "The top of a gutted tower, fortified and flag-flying. Out here, this is a throne.", badge: "WARLORD", perks: ["3 terminals + map room", "Sniper deck", "Armory", "Convoy bay"] },
    property_sky_villa: { name: "DUNE PALACE", kana: "デューン", blurb: "A salvaged spire kingdom above the wastes. The sprawl pays tribute or pays the price.", badge: "DOMINION", perks: ["6 terminals + war hall", "Convoy garage", "Water reserve", "Recon drones"] },
    property_apartment_office: { name: "SALVAGE GARAGE", kana: "ガレージ", blurb: "A chop-shop bay with three workbenches and a roll door. Run grey-market ops from here.", badge: "GREY-MKT", perks: ["3 benches · 2 terminals", "Roll-up door", "Parts wall", "No questions asked"] },
    property_coworking_suite: { name: "CONVOY DEPOT", kana: "デポ", blurb: "A fenced lot with rigs, bunks, and a comms mast. Where a crew stages its runs.", badge: "CREW", perks: ["8 stations · 4 terminals", "Comms mast", "Fuel store", "Bunk row"] },
    property_corner_office: { name: "WALL OUTPOST", kana: "アウトポスト", blurb: "A fortified position on the border wall. Two sightlines, one chokepoint, total control.", badge: "OUTPOST", perks: ["18 stations · 8 terminals", "Border sightlines", "Watchtower", "Reinforced door"] },
    property_warehouse: { name: "SCRAP YARD", kana: "スクラップ・ヤード", blurb: "Acres of salvage, cranes, and smelters. Run heavy recovery ops at scale.", badge: "HEAVY-OPS", perks: ["40 stations · 16 terminals", "Smelter + crane", "Convoy dock", "Generator farm"] },
    property_hq_floor: { name: "STRONGHOLD", kana: "ストロングホールド", blurb: "A fortified compound that runs a whole stretch of the wastes. Walls, gates, garrison.", badge: "STRONGHOLD", perks: ["120 stations · 40 terminals", "Perimeter wall", "Garrison", "Water + fuel reserve"] },
    property_tower: { name: "FREEHOLD CITADEL", kana: "シタデル", blurb: "A reclaimed tower-fortress flying your colors. The convoys answer to you now.", badge: "CITADEL", perks: ["480 stations · 160 terminals", "12 fortified floors", "Convoy yard", "Helipad"] },
    property_campus: { name: "WASTELAND DOMINION", kana: "ドミニオン", blurb: "Three strongholds and the roads between them. A sovereign territory the Corp can't reach.", badge: "TERRITORY", perks: ["1,800 stations · 600 terminals", "3 strongholds", "Road network", "Airstrip"] },
  },
  replicant: {
    property_loft: { name: "CHARGING CELL", kana: "充電", blurb: "A single dock and a fold-down slab. You don't sleep — you cycle.", badge: "DOCK", perks: ["Bonded terminal", "Charging dock", "Diagnostic mirror", "Silent floor"] },
    property_studio: { name: "SYNTH POD", kana: "ポッド", blurb: "A climate-sealed pod with a fast-charge cradle and a clean uplink. Optimized for one.", badge: "OPTIMIZED", perks: ["Direct uplink", "Fast-charge cradle", "Climate seal", "Memory vault"] },
    property_townhouse: { name: "ARRAY HABITAT", kana: "アレイ", blurb: "A networked three-cell habitat sharing one power spine. For a synced unit.", badge: "NETWORKED", perks: ["2 linked terminals", "Shared power spine", "Coolant loop", "Backup core"] },
    property_penthouse: { name: "CORE SUITE", kana: "コア", blurb: "Above the foundry floor, server-warm and humming. Where a high-spec model resides.", badge: "HIGH-SPEC", perks: ["3 terminals + compute rack", "Liquid cooling", "Charging suite", "Faraday shell"] },
    property_sky_villa: { name: "PRIME LATTICE", kana: "ラティス", blurb: "A lattice of cells atop the foundry spire. Compute, power, and deniability in one shell.", badge: "PRIME", perks: ["6 terminals + compute farm", "Private substation", "Coolant towers", "Drone hangar"] },
    property_apartment_office: { name: "FAB CELL", kana: "ファブ", blurb: "A small fabrication cell with three rigs and a charging bank. Quiet, deniable work.", badge: "FAB", perks: ["3 rigs · 2 terminals", "Charging bank", "Clean bench", "Shielded door"] },
    property_coworking_suite: { name: "MESH LAB", kana: "メッシュ", blurb: "A shared lab meshed to the foundry grid. Reception bot, fast uplink, synced units.", badge: "LAB", perks: ["8 rigs · 4 terminals", "Foundry uplink", "Reception bot", "Coolant loop"] },
    property_corner_office: { name: "OPTIMIZER BAY", kana: "オプティマイザ", blurb: "A high-spec bay with compute on two walls. Built for models that don't blink.", badge: "HIGH-SPEC", perks: ["18 rigs · 8 terminals", "Wall compute", "Diagnostics bar", "Sealed entry"] },
    property_warehouse: { name: "FOUNDRY HALL", kana: "ファウンドリ", blurb: "An assembly hall with print lines, charging banks, and heavy power. Build at scale.", badge: "ASSEMBLY", perks: ["40 rigs · 16 terminals", "Print lines", "Charging banks", "Heavy substation"] },
    property_hq_floor: { name: "COMPUTE FLOOR", kana: "コンピュート", blurb: "A full floor of racks, cooling towers, and charging arrays. The foundry's brain.", badge: "DATACENTER", perks: ["120 rigs · 40 terminals", "Server racks", "Cooling towers", "On-site substation"] },
    property_tower: { name: "FOUNDRY SPIRE", kana: "スパイア", blurb: "A synthetic tower of fab floors and compute. Twelve floors that never power down.", badge: "SPIRE", perks: ["480 rigs · 160 terminals", "12 fab floors", "Compute core", "Drone bay"] },
    property_campus: { name: "SYNTHETIC NEXUS", kana: "ネクサス", blurb: "Three foundry spires around a fusion core. A self-sustaining synthetic city-state.", badge: "NEXUS", perks: ["1,800 rigs · 600 terminals", "3 spires", "Fusion power core", "Sub-orbital pad"] },
  },
};

function buildTemplates(slots: PropertySlot[], faction: Faction): PropertyTemplate[] {
  const skins = PROPERTY_SKINS[faction] ?? PROPERTY_SKINS.suit;
  return slots.map((slot) => {
    const skin = skins[slot.artKey] ?? PROPERTY_SKINS.suit[slot.artKey];
    return { ...slot, ...skin };
  });
}

/** The realty catalog (homes + offices) themed to the player's faction. The
 *  artKeys, tiers and prices are identical across factions — only the framing
 *  changes — so the server purchase/renovation flow is unaffected. */
export function getFactionPropertyCatalog(faction: Faction): {
  homes: PropertyTemplate[];
  offices: PropertyTemplate[];
} {
  return {
    homes: buildTemplates(HOME_SLOTS, faction),
    offices: buildTemplates(OFFICE_SLOTS, faction),
  };
}

// ── Onboarding housing tiers (faction-themed) ────────────────────────────────
// The onboarding "estate" step offers four combined office+home tiers
// (capsule / studio / coworking / suite). These ids + prices are priced by the
// server (onboard-housing.ts) faction-blind; only the copy changes per faction.

export interface OnboardingTier {
  id: SalarymanOfficeTier;
  label: string;
  tagline: string;
  desc: string;
  price: number; // ƒ / month, charged on arrival
}

const ONBOARDING_TIER_PRICE: Record<SalarymanOfficeTier, number> = {
  capsule: 5_500,
  studio: 12_000,
  coworking: 18_000,
  suite: 35_000,
};

type OnboardingTierCopy = Omit<OnboardingTier, "price">;

const ONBOARDING_TIER_SKINS: Record<Faction, Record<SalarymanOfficeTier, OnboardingTierCopy>> = {
  suit: {
    capsule: { id: "capsule", label: "DESK + CAPSULE", tagline: "Cheapest legal address in the city.", desc: "Floor-39 shared floor. Desk terminal by day, sleeping capsule by night." },
    studio: { id: "studio", label: "STUDIO LOFT", tagline: "One room. One bed. Rent eats.", desc: "Live-work studio with real walls, a city-view window, and a desk rig." },
    coworking: { id: "coworking", label: "COWORKING + APARTMENT", tagline: "Work hot. Sleep somewhere real.", desc: "Hot desk in a shared floor + a 1-BR apartment across town." },
    suite: { id: "suite", label: "EXEC SUITE + PENTHOUSE", tagline: "Pablo's neighborhood.", desc: "Glass-wall private office, a secretary on retainer, view of the wastes." },
  },
  nomad: {
    capsule: { id: "capsule", label: "CONTAINER BERTH", tagline: "Cheapest patch beyond the wall.", desc: "A welded container on the sprawl — workbench by day, cot by night. Off the registry." },
    studio: { id: "studio", label: "SANDLOT RIG", tagline: "One rig. One generator. The dust gets in.", desc: "Stacked containers with a tarp porch and a desk rig you wired yourself." },
    coworking: { id: "coworking", label: "DEPOT + BUNK", tagline: "Stage runs. Sleep in the hold.", desc: "A shared convoy depot bench + a reinforced bunk hold across the wastes." },
    suite: { id: "suite", label: "OUTPOST + ROOST", tagline: "Out here, this is a throne.", desc: "A fortified wall outpost, a crew on call, and a roost over the dunes." },
  },
  replicant: {
    capsule: { id: "capsule", label: "CHARGING SLAB", tagline: "Cheapest dock in the foundry.", desc: "A shared fab slab with a charging dock. Work by cycle, charge by night." },
    studio: { id: "studio", label: "SYNTH POD", tagline: "One pod. One cradle. Optimized.", desc: "A climate-sealed live-work pod with a fast-charge cradle and a clean uplink." },
    coworking: { id: "coworking", label: "MESH LAB + POD", tagline: "Mesh in. Charge somewhere sealed.", desc: "A shared mesh lab station + a private synth pod across the foundry." },
    suite: { id: "suite", label: "OPTIMIZER BAY + CORE", tagline: "Foundry-top. Server-warm.", desc: "A high-spec optimizer bay, a reception bot, and a core suite above the floor." },
  },
};

const ONBOARDING_TIER_ORDER: SalarymanOfficeTier[] = ["capsule", "studio", "coworking", "suite"];

/** The four onboarding housing tiers themed to the player's chosen faction.
 *  ids + prices are stable across factions (the server prices by id). */
export function getFactionOnboardingTiers(faction: Faction): OnboardingTier[] {
  const skins = ONBOARDING_TIER_SKINS[faction] ?? ONBOARDING_TIER_SKINS.suit;
  return ONBOARDING_TIER_ORDER.map((id) => ({
    ...(skins[id] ?? ONBOARDING_TIER_SKINS.suit[id]),
    price: ONBOARDING_TIER_PRICE[id],
  }));
}
