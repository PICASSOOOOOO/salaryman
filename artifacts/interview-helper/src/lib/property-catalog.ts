// ── Canonical property ladder ────────────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for every property the player can hold, across BOTH the
// in-game ƒ realty showroom (RealtyStore) and the real-money Pledge Store. Before
// this module the realty cards, the owned-office tier map, and the pledge property
// items each described properties independently and drifted (mismatched names,
// duplicate "corner office / warehouse / penthouse" tiers in two stores with two
// art sets). Everything property-shaped now derives from PROPERTY_TEMPLATES so a
// tier's name, art-template key, interior scale and store placement agree
// everywhere.
//
// The ladder is one continuous progression:
//   • `store: 'realty'`  → leased / bought with ƒ (FIAT) at Downtown Realty.
//   • `store: 'pledge'`  → real-money permanent deed in the Pledge Store.
//   • A realty tier with `pledgeSku` set is ALSO available as a permanent
//     real-money deed (same template, same art) — the two stores are coherent.
//
// `artKey` is the canonical id AND the Nano Banana concept-art key
// (SALARYMAN_ART_KIT, served at /api/art/asset/:key) — so "what you buy" always
// maps to "what you see" on the card, in the portfolio, and in-world.
//
// The SERVER mirrors the price/tier rows in
// artifacts/api-server/src/routes/real-estate.ts (PROPERTY_CATALOG) and the
// renovation cost table — keep them in sync with this file.

import type { PropertyCustomization } from "../gameSystems";

export type PropertyTier = "capsule" | "studio" | "coworking" | "suite";
export type PropertyKind = "home" | "office";
export type PropertyStore = "realty" | "pledge";

export interface PropertyTemplate {
  artKey: string; // canonical id == Nano Banana concept-art key
  kind: PropertyKind;
  name: string;
  kana: string; // small katakana label for the Akira flavour
  blurb: string;
  tier: PropertyTier; // interior scale bucket (drives PixelOffice room scale)
  monthlyRent: number; // ƒ / month before market multiplier (0 for pledge-only)
  badge: string;
  desks?: number;
  userLimit: number;
  terminals: number;
  perks: string[];
  sqft: number;
  store: PropertyStore; // where this tier is primarily sold
  // Real-money SKU (pledge item id) that grants this exact template as a
  // permanent deed. Present only on realty tiers that ALSO have a pledge deed.
  pledgeSku?: string;
}

// HOMES — entry tier starts at ƒ10,000/mo per product spec.
const HOMES: PropertyTemplate[] = [
  {
    artKey: "property_loft", kind: "home", name: "STARTER LOFT", kana: "スターター",
    blurb: "One room, one window, no commute. Where every founding story actually starts.",
    tier: "capsule", monthlyRent: 10_000, badge: "ENTRY", userLimit: 1, terminals: 1,
    perks: ["Solo terminal", "Murphy bed", "Hot plate", "Ground-floor mail slot"],
    sqft: 320, store: "realty",
  },
  {
    artKey: "property_studio", kind: "home", name: "MIDTOWN STUDIO", kana: "ミッドタウン",
    blurb: "Real bedroom, real shower, decent view of the noodle cart on 7th. Quiet enough to think.",
    tier: "studio", monthlyRent: 22_000, badge: "STANDARD", userLimit: 2, terminals: 1,
    perks: ["Private terminal nook", "Full bath", "Quiet floor", "Roof access"],
    sqft: 540, store: "realty",
  },
  {
    artKey: "property_townhouse", kind: "home", name: "FAMILY TOWNHOUSE", kana: "タウンハウス",
    blurb: "Three floors, your own door. The neighbours nod and mind their business.",
    tier: "studio", monthlyRent: 55_000, badge: "FAMILY", userLimit: 4, terminals: 2,
    perks: ["2 networked terminals", "Garage", "Backyard plot", "School zone"],
    sqft: 1450, store: "realty",
  },
  {
    artKey: "property_penthouse", kind: "home", name: "EXECUTIVE PENTHOUSE", kana: "ペントハウス",
    blurb: "Marble floor, helipad-adjacent. The kind of address you don't print on a business card — they already know.",
    tier: "suite", monthlyRent: 180_000, badge: "ELITE", userLimit: 6, terminals: 3,
    perks: ["3 terminals + war room", "Concierge", "Helipad access", "Sky garden"],
    sqft: 3200, store: "realty",
  },
  {
    artKey: "property_sky_villa", kind: "home", name: "SKY VILLA", kana: "スカイ・ヴィラ",
    blurb: "Above the cloud layer. The whole city is just a lighting effect from up here.",
    tier: "suite", monthlyRent: 450_000, badge: "ULTRA", userLimit: 12, terminals: 6,
    perks: ["6 terminals + screening room", "Private elevator", "Onsen deck", "Drone bay"],
    sqft: 7400, store: "realty",
  },
];

// OFFICES — entry tier is an APARTMENT in a different building (per product:
// "the entry-level office should be an apartment in another building, not
// Shadow"). Then we scale up to a multi-tower campus for big orgs.
const OFFICES: PropertyTemplate[] = [
  {
    artKey: "property_apartment_office", kind: "office", name: "APARTMENT OFFICE", kana: "アパートメント",
    blurb: "A 2-bedroom on the 14th floor of a residential block — desks against the windows, kettle always on.",
    tier: "studio", monthlyRent: 10_000, badge: "ENTRY", desks: 3, userLimit: 4, terminals: 2,
    perks: ["3 desks · 2 terminals", "Residential building", "Kitchenette", "Discreet door"],
    sqft: 720, store: "realty",
  },
  {
    artKey: "property_coworking_suite", kind: "office", name: "CO-WORKING SUITE", kana: "コワーキング",
    blurb: "Glass-walled suite inside a co-working tower. Reception & wifi included; meetings on the hour.",
    tier: "coworking", monthlyRent: 28_000, badge: "STARTUP", desks: 8, userLimit: 10, terminals: 4,
    perks: ["8 desks · 4 terminals", "Reception included", "Phone booths", "Roof terrace"],
    sqft: 1300, store: "realty",
  },
  {
    artKey: "property_corner_office", kind: "office", name: "CORNER OFFICE", kana: "コーナー",
    blurb: "Floor-to-ceiling glass on two walls. Not subtle. Not supposed to be.",
    tier: "suite", monthlyRent: 80_000, badge: "EXEC", desks: 18, userLimit: 22, terminals: 8,
    perks: ["18 desks · 8 terminals", "Glass on two walls", "Espresso bar", "Door that locks"],
    sqft: 2200, store: "realty", pledgeSku: "prop_corner_office",
  },
  {
    artKey: "property_warehouse", kind: "office", name: "OPERATIONS WAREHOUSE", kana: "ウェアハウス",
    blurb: "High ceilings, roll-up door, room for forklifts and ambition. Run real ops out of this one.",
    tier: "suite", monthlyRent: 160_000, badge: "OPS", desks: 40, userLimit: 48, terminals: 16,
    perks: ["40 desks · 16 terminals", "Loading dock", "Bot-tube hookups", "Heavy-amp power"],
    sqft: 6800, store: "realty", pledgeSku: "prop_warehouse",
  },
  {
    artKey: "property_hq_floor", kind: "office", name: "HEADQUARTERS FLOOR", kana: "ヘッドクォーター",
    blurb: "A whole floor of a glass tower. Reception, war rooms, server closets, the works.",
    tier: "suite", monthlyRent: 400_000, badge: "HQ", desks: 120, userLimit: 140, terminals: 40,
    perks: ["120 desks · 40 terminals", "Reception + lobby", "8 war rooms", "On-site server closet"],
    sqft: 18_500, store: "realty",
  },
  {
    artKey: "property_tower", kind: "office", name: "PRIVATE TOWER", kana: "プライベート・タワー",
    blurb: "Your name on the lobby. Twelve floors, a cafeteria, helipad on top. The org takes the whole stack.",
    tier: "suite", monthlyRent: 1_200_000, badge: "TOWER", desks: 480, userLimit: 600, terminals: 160,
    perks: ["480 desks · 160 terminals", "12 floors", "Cafeteria + gym", "Helipad"],
    sqft: 120_000, store: "realty",
  },
  {
    artKey: "property_campus", kind: "office", name: "CORPORATE CAMPUS", kana: "コーポレート・キャンパス",
    blurb: "Three towers around a koi pond. Self-driving shuttles between buildings. A small sovereign nation.",
    tier: "suite", monthlyRent: 4_000_000, badge: "CAMPUS", desks: 1800, userLimit: 2400, terminals: 600,
    perks: ["1,800 desks · 600 terminals", "3 towers", "Shuttles + koi pond", "Sub-orbital pad"],
    sqft: 540_000, store: "realty",
  },
];

export const PROPERTY_TEMPLATES: PropertyTemplate[] = [...HOMES, ...OFFICES];

// Realty-store views (ƒ). RealtyStore renders these directly.
export const REALTY_HOMES: PropertyTemplate[] = PROPERTY_TEMPLATES.filter(
  (p) => p.store === "realty" && p.kind === "home",
);
export const REALTY_OFFICES: PropertyTemplate[] = PROPERTY_TEMPLATES.filter(
  (p) => p.store === "realty" && p.kind === "office",
);

const TEMPLATE_BY_ART_KEY: Record<string, PropertyTemplate> = Object.fromEntries(
  PROPERTY_TEMPLATES.map((p) => [p.artKey, p]),
);

export function getTemplate(artKey: string): PropertyTemplate | undefined {
  return TEMPLATE_BY_ART_KEY[artKey];
}

// artKey -> interior tier. Replaces the standalone OFFICE_ARTKEY_TIER map in
// owned-office.ts so the bucket a template scales into can never drift from the
// ladder. Unknown keys fall back to the smallest bucket.
export function tierForArtKey(artKey: string): PropertyTier {
  return TEMPLATE_BY_ART_KEY[artKey]?.tier ?? "capsule";
}

// ── Renovation labor cost ────────────────────────────────────────────────────
// Customizing a property is framed as paying a renovation crew: each committed
// change costs ƒ in labor, scaled by the property tier (a bigger space takes more
// crew-days). Mirrored server-side in real-estate.ts — keep in sync.
export const TIER_LABOR_COST: Record<PropertyTier, number> = {
  capsule: 2_000,
  studio: 6_000,
  coworking: 18_000,
  suite: 60_000,
};

export function renovationLaborCost(tier: PropertyTier): number {
  return TIER_LABOR_COST[tier] ?? TIER_LABOR_COST.capsule;
}

// Approx crew-days a renovation represents, purely for flavour copy in the UI.
export function renovationCrewDays(tier: PropertyTier): number {
  return { capsule: 1, studio: 2, coworking: 4, suite: 8 }[tier] ?? 1;
}

export type { PropertyCustomization };
