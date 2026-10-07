export type TowerBusinessValueDriver =
  | "health"
  | "income"
  | "skills"
  | "beauty"
  | "infrastructure";

export type TowerBusinessImprovement =
  | "effectiveness"
  | "durability"
  | "comfort"
  | "quality"
  | "capacity";

export type TowerBusinessStockLine = {
  id: string;
  label: string;
  specialty: string;
  sellerBusinessKey: string | null;
  sellerName: string | null;
  sellerLocationLabel: string | null;
  /** IDs are resolved against the live item catalog; an empty list is a category-only listing. */
  itemIds: readonly string[];
  quoteCategories: readonly string[];
  priceSource: "catalog_item" | "seller_quote";
  /** Relative product value; higher-value health/income/skill items should price higher. */
  valueRank: 1 | 2 | 3 | 4 | 5;
  valueDrivers: readonly TowerBusinessValueDriver[];
  /** Stable family/version fields let future NPC businesses publish improved stock. */
  npcProductFamily: string;
  npcVersion: 1;
  npcExpansion: {
    ready: true;
    simulationEnabled: false;
    scope: "specialty_only";
    improvementAxes: readonly TowerBusinessImprovement[];
  };
};

/**
 * These are read-only business-stock and quote lines shown at vending machines.
 * Physical locations are included only when an existing business is assigned.
 * No marketplace, seller, stock, or price is invented for unassigned lines.
 */
export const TOWER_BUSINESS_STOCK_LINES: readonly TowerBusinessStockLine[] = [
  {
    id: "fine-rugs",
    label: "Fine rugs",
    specialty: "flooring",
    sellerBusinessKey: "furniture-store",
    sellerName: "FURNITURE STORE",
    sellerLocationLabel: "FLOOR 06 / OFFICE 04",
    itemIds: [],
    quoteCategories: ["Fine rugs"],
    priceSource: "seller_quote",
    valueRank: 2,
    valueDrivers: ["beauty"],
    npcProductFamily: "flooring",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["quality", "durability"] },
  },
  {
    id: "lamps",
    label: "Lamps",
    specialty: "lighting",
    sellerBusinessKey: "furniture-store",
    sellerName: "FURNITURE STORE",
    sellerLocationLabel: "FLOOR 06 / OFFICE 04",
    itemIds: [],
    quoteCategories: ["Desk lamps", "Floor lamps"],
    priceSource: "seller_quote",
    valueRank: 2,
    valueDrivers: ["beauty", "income"],
    npcProductFamily: "lighting",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["effectiveness", "quality"] },
  },
  {
    id: "desks",
    label: "Desks",
    specialty: "office-furniture",
    sellerBusinessKey: "furniture-store",
    sellerName: "FURNITURE STORE",
    sellerLocationLabel: "FLOOR 06 / OFFICE 04",
    itemIds: ["furn_desk"],
    quoteCategories: ["Additional desk styles"],
    priceSource: "catalog_item",
    valueRank: 3,
    valueDrivers: ["income"],
    npcProductFamily: "desks",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["comfort", "durability", "quality"] },
  },
  {
    id: "chairs",
    label: "Chairs",
    specialty: "office-furniture",
    sellerBusinessKey: "furniture-store",
    sellerName: "FURNITURE STORE",
    sellerLocationLabel: "FLOOR 06 / OFFICE 04",
    itemIds: [],
    quoteCategories: ["Office chairs"],
    priceSource: "seller_quote",
    valueRank: 2,
    valueDrivers: ["income"],
    npcProductFamily: "chairs",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["comfort", "durability"] },
  },
  {
    id: "terminals",
    label: "Terminals",
    specialty: "office-technology",
    sellerBusinessKey: null,
    sellerName: null,
    sellerLocationLabel: null,
    itemIds: [],
    quoteCategories: ["Work terminals"],
    priceSource: "seller_quote",
    valueRank: 4,
    valueDrivers: ["income", "skills"],
    npcProductFamily: "terminals",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["effectiveness", "capacity", "quality"] },
  },
  {
    id: "aquariums-and-fish",
    label: "Aquariums and fish",
    specialty: "aquatics",
    sellerBusinessKey: "fish-store",
    sellerName: "FISH STORE",
    sellerLocationLabel: "FLOOR 06 / OFFICE 03",
    itemIds: ["decor_aquarium"],
    quoteCategories: ["Fish"],
    priceSource: "catalog_item",
    valueRank: 2,
    valueDrivers: ["beauty"],
    npcProductFamily: "aquariums",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["quality", "capacity"] },
  },
  {
    id: "water-coolers",
    label: "Water coolers",
    specialty: "hydration-equipment",
    sellerBusinessKey: null,
    sellerName: null,
    sellerLocationLabel: null,
    itemIds: [],
    quoteCategories: ["Water coolers and replacement supplies"],
    priceSource: "seller_quote",
    valueRank: 3,
    valueDrivers: ["health", "infrastructure"],
    npcProductFamily: "water-coolers",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["effectiveness", "capacity", "durability"] },
  },
  {
    id: "vending-machines",
    label: "Vending machines",
    specialty: "retail-equipment",
    sellerBusinessKey: "tower_vending",
    sellerName: "TOWER VENDING",
    sellerLocationLabel: "FLOOR 01 / LOBBY VENDING",
    itemIds: [],
    quoteCategories: ["Vending machines and stock"],
    priceSource: "seller_quote",
    valueRank: 4,
    valueDrivers: ["income", "infrastructure"],
    npcProductFamily: "vending-machines",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["capacity", "effectiveness", "durability"] },
  },
  {
    id: "atms",
    label: "ATMs",
    specialty: "banking-equipment",
    sellerBusinessKey: "tower_atm",
    sellerName: "OMBRA TOWER CASH",
    sellerLocationLabel: "FLOOR 01 / LOBBY ATM",
    itemIds: [],
    quoteCategories: ["ATM equipment"],
    priceSource: "seller_quote",
    valueRank: 5,
    valueDrivers: ["infrastructure", "income"],
    npcProductFamily: "atms",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["capacity", "effectiveness", "durability"] },
  },
  {
    id: "education-books",
    label: "Books and skill courses",
    specialty: "education",
    sellerBusinessKey: null,
    sellerName: null,
    sellerLocationLabel: null,
    itemIds: ["vend_interview_drill", "vend_trade_cert"],
    quoteCategories: [],
    priceSource: "catalog_item",
    valueRank: 5,
    valueDrivers: ["skills", "income"],
    npcProductFamily: "education-books",
    npcVersion: 1,
    npcExpansion: { ready: true, simulationEnabled: false, scope: "specialty_only", improvementAxes: ["effectiveness", "quality"] },
  },
];

export const TOWER_GHOST_LISTING = {
  id: "the-ghost",
  label: "THE GHOST",
  availability: "direct_npc" as const,
  requiresProximityInteraction: true,
  itemIds: [] as readonly string[],
  stockStatus: "not_provided" as const,
  priceSource: "quoted_in_person" as const,
  notice: "Ask the Ghost directly. No item-level stock or prices are published here.",
};
