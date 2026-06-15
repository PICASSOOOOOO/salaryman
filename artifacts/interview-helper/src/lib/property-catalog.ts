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
