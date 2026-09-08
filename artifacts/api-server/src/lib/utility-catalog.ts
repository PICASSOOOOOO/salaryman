/**
 * SALARYMAN — PABLO POWER & GAS utility catalog.
 *
 * The single source of truth for the city's energy economy: who sells power,
 * what a battery costs and holds, what a unit of gas costs, and the rate to
 * charge electricity. Pablo owns the only power company in the city — the
 * grid, the gas mains, every charging post and every pump route back to one
 * ledger. This module is intentionally loop-free: it defines the company
 * entity, the goods, and the rates. The battery charge/install loop and the
 * gas consumption/cooking loop are downstream features that IMPORT from here
 * so the numbers never drift.
 *
 * All pricing is FIAT (ƒ). There are no real-money utility purchases.
 */

/**
 * The Pablo-owned utility monopoly. Surfaced at every point a player buys or
 * draws power (vending machines, charging stations, gas pumps) so the brand
 * and the lore stay consistent.
 */
export const UTILITY_COMPANY = {
  id: "pablo_power_gas",
  /** Owning org — revenue routes here (see lib/utility-revenue.ts). */
  ownerOrg: "PICASSO",
  name: "PABLO POWER & GAS",
  kana: "電力・ガス公社",
  tagline: "Every volt. Every drop. One meter.",
  /** One-paragraph lore for panels/tooltips. */
  lore:
    "Beneath the city, past the sewer line, Pablo's underground fusion plant " +
    "hums day and night. It is the only thing keeping the lights on — and the " +
    "only name on the bill. Batteries, gas, the charge in the wall: all of it " +
    "flows up from the same reactor, and all of it flows back to PABLO POWER & GAS.",
  /** Short branding strap for narration prompts. */
  strap: "PABLO POWER & GAS — the city's only utility.",
} as const;

export type UtilityKind = "battery" | "gas" | "electricity";
export type BatteryTier = "standard" | "high_yield";

/**
 * A battery sold by the utility. `itemId` keys the existing stackable consumable
 * in item-catalog.ts — this catalog owns the price and the charge capacity so
 * the inventory item and the energy loop share one number.
 */
export interface BatterySpec {
  itemId: string;
  name: string;
  tier: BatteryTier;
  /** Stored energy in charge units (kWh-equivalent). Consumed by the battery loop. */
  capacity: number;
  /** Purchase price in FIAT (ƒ). */
  priceFiat: number;
  icon: string;
}

/**
 * Standard + high-yield batteries. Capacity scales far faster than price at the
 * top end — the fusion core is the monopoly's flagship product.
 */
export const UTILITY_BATTERIES: readonly BatterySpec[] = [
  { itemId: "batt_aa",     name: "AA Cell Pack",     tier: "standard",   capacity: 20,   priceFiat: 800,   icon: "🔋" },
  { itemId: "batt_cell",   name: "Power Cell",       tier: "standard",   capacity: 120,  priceFiat: 4500,  icon: "🔋" },
  { itemId: "batt_fusion", name: "Micro-Fusion Core", tier: "high_yield", capacity: 1200, priceFiat: 38000, icon: "⚛️" },
] as const;

/**
 * Gas products sold at the pumps. `itemId` keys the existing fuel consumables.
 * `units` is how many gas units one container holds (consumed by the gas loop).
 */
export interface GasProductSpec {
  itemId: string;
  name: string;
  units: number;
  priceFiat: number;
  icon: string;
}

export const UTILITY_GAS_PRODUCTS: readonly GasProductSpec[] = [
  { itemId: "fuel_gas_can", name: "Gas Can",     units: 20, priceFiat: 600,  icon: "⛽" },
  { itemId: "fuel_diesel",  name: "Diesel Drum", units: 80, priceFiat: 2400, icon: "🛢️" },
] as const;

/** Per-unit price of raw gas in FIAT (ƒ). The pumps and the gas loop both use this. */
export const GAS_UNIT_PRICE_FIAT = 35;

/** Cost in FIAT (ƒ) to charge one unit of electricity into a battery. Used by the charging stations and the battery charge loop. */
export const ELECTRICITY_RATE_FIAT_PER_UNIT = 9;

/** FIAT price of any battery by item id (source of truth for item-catalog). */
export const BATTERY_PRICE_FIAT: Readonly<Record<string, number>> = Object.fromEntries(
  UTILITY_BATTERIES.map((b) => [b.itemId, b.priceFiat]),
);

/** FIAT price of any gas product by item id (source of truth for item-catalog). */
export const GAS_PRODUCT_PRICE_FIAT: Readonly<Record<string, number>> = Object.fromEntries(
  UTILITY_GAS_PRODUCTS.map((g) => [g.itemId, g.priceFiat]),
);

/** Lookup a battery spec by its inventory item id. */
export function findBatterySpec(itemId: string): BatterySpec | undefined {
  return UTILITY_BATTERIES.find((b) => b.itemId === itemId);
}

/** Lookup a gas product spec by its inventory item id. */
export function findGasProduct(itemId: string): GasProductSpec | undefined {
  return UTILITY_GAS_PRODUCTS.find((g) => g.itemId === itemId);
}

/** True if the item id is a utility good (battery or fuel) — drives revenue routing. */
export function isUtilityItem(itemId: string): boolean {
  return itemId in BATTERY_PRICE_FIAT || itemId in GAS_PRODUCT_PRICE_FIAT;
}

/** The utility kind for a given item id, or null if it isn't a utility good. */
export function utilityKindForItem(itemId: string): UtilityKind | null {
  if (itemId in BATTERY_PRICE_FIAT) return "battery";
  if (itemId in GAS_PRODUCT_PRICE_FIAT) return "gas";
  return null;
}

/** A serializable snapshot of the whole catalog for the client. */
export function utilityCatalogPayload() {
  return {
    company: UTILITY_COMPANY,
    batteries: UTILITY_BATTERIES,
    gasProducts: UTILITY_GAS_PRODUCTS,
    gasUnitPriceFiat: GAS_UNIT_PRICE_FIAT,
    electricityRateFiatPerUnit: ELECTRICITY_RATE_FIAT_PER_UNIT,
  };
}
