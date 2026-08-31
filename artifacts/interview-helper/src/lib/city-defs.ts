// ─── City definitions registry ───────────────────────────────────────────────
// Foundation for the multi-city world. Each playable city is a CityDef: the SAME
// mechanics everywhere, but a distinct art theme, weather mood, name, and (for
// walled cities) confining walls. Travel re-skins the world and repositions the
// player so arriving feels like a whole different part of the world — the shared
// geometry underneath is never surfaced to the player.
//
// Network/realm identity (timezones, server URLs) lives in `world-servers.ts`
// (PLANNED_CITIES). THIS file owns the in-world geometry + visual identity that
// the renderer and travel system consume.
//
// Minx City reuses the existing hardcoded layout from `city-config.ts` verbatim so
// the live world is byte-identical.

import {
  CITY_NAME,
  DOWNTOWN_BOUNDS,
  CITY_CENTER,
  CORE_ANCHORS,
  CITY_QUADRANTS,
  FOREST_ZONES,
  type CoreAnchor,
  type CityQuadrant,
  type ForestZone,
} from './city-config';

export type WeatherKind = 'CLEAR' | 'RAIN' | 'SNOW' | 'STORM' | 'DUST' | 'ACID_RAIN' | 'FOG';

/** Visual identity for a city. Same mechanics, different look. */
export interface CityTheme {
  /** Wasteland ground / terrain base + accent. */
  groundColor: string;
  groundAccent: string;
  /** Sky tints blended by time-of-day (day → dusk → night). */
  skyDay: string;
  skyDusk: string;
  skyNight: string;
  /** Atmospheric haze color (distinct from the poison-gas fog). */
  hazeColor: string;
  /** Procedural building palette. */
  buildingBase: string;
  buildingWindow: string;
  neon: string;
  /** UI accent used in maps / HUD for this city. */
  accent: string;
}

/** Weather mood for a city. Weights bias the existing weather roll; `pinnedHour`
 *  forces a fixed time-of-day (e.g. a city locked in perpetual dusk). */
export interface CityWeatherBias {
  weights: Partial<Record<WeatherKind, number>>;
  pinnedHour?: number;
}

/** An axis-aligned solid wall segment (world coords). Used to confine a walled city. */
export interface CityWall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CityTravelHub {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface CityDef {
  id: string;
  name: string;
  region: string;
  /** Travelable inside THIS deployment right now. */
  live: boolean;
  walled: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
  center: { x: number; y: number };
  coreAnchors: readonly CoreAnchor[];
  quadrants: readonly CityQuadrant[];
  forestZones: readonly ForestZone[];
  /** Boundary walls for a walled city (collision). Undefined = open city. */
  walls?: readonly CityWall[];
  /** Where the city-to-city station stands, and where arrivals spawn. */
  travelHub: CityTravelHub;
  arrival: { x: number; y: number };
  theme: CityTheme;
  weatherBias: CityWeatherBias;
}

// ── MINX CITY (NA / Americas) ───────────────────────────────────────────────
// Reuses the existing hardcoded Minx layout. Neon-noir corporate aesthetic.
const MINX_CITY: CityDef = {
  id: 'minx_city',
  name: CITY_NAME, // 'MINX CITY'
  region: 'AMERICAS — NORTH',
  live: true,
  walled: false,
  bounds: { ...DOWNTOWN_BOUNDS },
  center: { ...CITY_CENTER },
  coreAnchors: CORE_ANCHORS,
  quadrants: CITY_QUADRANTS,
  forestZones: FOREST_ZONES,
  travelHub: { id: 'minx_transit', label: 'MINX TRANSIT TERMINAL', x: 7065, y: 6418 },
  arrival: { x: CITY_CENTER.x, y: CITY_CENTER.y },
  theme: {
    groundColor: '#1a1622',
    groundAccent: '#241d33',
    skyDay: '#3a3550',
    skyDusk: '#2a2140',
    skyNight: '#0c0a16',
    hazeColor: '#2a2440',
    buildingBase: '#2b2740',
    buildingWindow: '#22d3ee',
    neon: '#f472b6',
    accent: '#a855f7',
  },
  weatherBias: {
    weights: { CLEAR: 5, RAIN: 3, STORM: 1, FOG: 2, DUST: 1, ACID_RAIN: 1, SNOW: 1 },
  },
};

// ── HUDA CITY (Asia) — walled survivors' enclave ─────────────────────────────
// Practical re-skin: same mechanics + coordinate space as Minx, but a distinct
// jade/lantern anime palette, a perpetual misty dusk, and a ring of walls that
// confine players to the un-destroyed core. Feels like a different world; reuses
// the proven layout underneath.
const HUDA_WALL_PAD = 520;
const HUDA_WALL_THICK = 90;
const HUDA_INNER = {
  left: DOWNTOWN_BOUNDS.left - HUDA_WALL_PAD,
  top: DOWNTOWN_BOUNDS.top - HUDA_WALL_PAD,
  right: DOWNTOWN_BOUNDS.right + HUDA_WALL_PAD,
  bottom: DOWNTOWN_BOUNDS.bottom + HUDA_WALL_PAD,
};
const HUDA_WALLS: readonly CityWall[] = [
  // top
  { x: HUDA_INNER.left - HUDA_WALL_THICK, y: HUDA_INNER.top - HUDA_WALL_THICK, w: (HUDA_INNER.right - HUDA_INNER.left) + HUDA_WALL_THICK * 2, h: HUDA_WALL_THICK },
  // bottom
  { x: HUDA_INNER.left - HUDA_WALL_THICK, y: HUDA_INNER.bottom, w: (HUDA_INNER.right - HUDA_INNER.left) + HUDA_WALL_THICK * 2, h: HUDA_WALL_THICK },
  // left
  { x: HUDA_INNER.left - HUDA_WALL_THICK, y: HUDA_INNER.top - HUDA_WALL_THICK, w: HUDA_WALL_THICK, h: (HUDA_INNER.bottom - HUDA_INNER.top) + HUDA_WALL_THICK * 2 },
  // right
  { x: HUDA_INNER.right, y: HUDA_INNER.top - HUDA_WALL_THICK, w: HUDA_WALL_THICK, h: (HUDA_INNER.bottom - HUDA_INNER.top) + HUDA_WALL_THICK * 2 },
];

const HUDA_CITY: CityDef = {
  id: 'huda_city',
  name: 'HUDA CITY',
  region: 'ASIA — EAST',
  live: true,
  walled: true,
  bounds: { ...DOWNTOWN_BOUNDS },
  center: { ...CITY_CENTER },
  coreAnchors: CORE_ANCHORS,
  quadrants: CITY_QUADRANTS,
  forestZones: FOREST_ZONES,
  walls: HUDA_WALLS,
  travelHub: { id: 'huda_gate', label: 'HUDA SOUTH GATE', x: 7065, y: 6418 },
  arrival: { x: CITY_CENTER.x, y: CITY_CENTER.y },
  theme: {
    groundColor: '#141a18',
    groundAccent: '#1c2a24',
    skyDay: '#34423c',
    skyDusk: '#3a2a2e',
    skyNight: '#0a1210',
    hazeColor: '#1f2e2a',
    buildingBase: '#243029',
    buildingWindow: '#ffb347',
    neon: '#ff4d4d',
    accent: '#3ddc97',
  },
  weatherBias: {
    weights: { FOG: 5, RAIN: 4, CLEAR: 2, ACID_RAIN: 2, STORM: 1, DUST: 1 },
    pinnedHour: 19,
  },
};

// ── CITY REGISTRY ────────────────────────────────────────────────────────────
export const CITY_DEFS: Record<string, CityDef> = {
  [MINX_CITY.id]: MINX_CITY,
  [HUDA_CITY.id]: HUDA_CITY,
};

export const DEFAULT_CITY_ID = 'minx_city';

export function getCityDef(id: string | null | undefined): CityDef {
  return (id && CITY_DEFS[id]) || CITY_DEFS[DEFAULT_CITY_ID];
}

export function listCityDefs(): CityDef[] {
  return Object.values(CITY_DEFS);
}

export function isWalledCity(id: string | null | undefined): boolean {
  return getCityDef(id).walled;
}

// ── ACTIVE CITY (client-side) ────────────────────────────────────────────────
// The world renders one active city at a time. Travel swaps this. Defaults to
// Minx so existing single-city behavior is unchanged.
let activeCityId = DEFAULT_CITY_ID;

export function getActiveCityId(): string {
  return activeCityId;
}

export function setActiveCityId(id: string): CityDef {
  activeCityId = CITY_DEFS[id] ? id : DEFAULT_CITY_ID;
  return CITY_DEFS[activeCityId];
}

/**
 * Extract a playable city from the persisted save shape. `cityId` is the
 * current realm; `homeCityId` is retained as a backwards-compatible fallback
 * for saves made before home selection also set the current realm.
 */
export function getSavedCityId(save: unknown): string | null {
  if (!save || typeof save !== 'object') return null;
  const { cityId, homeCityId } = save as { cityId?: unknown; homeCityId?: unknown };
  if (typeof cityId === 'string' && CITY_DEFS[cityId]) return cityId;
  if (typeof homeCityId === 'string' && CITY_DEFS[homeCityId]) return homeCityId;
  return null;
}

export function getActiveCityDef(): CityDef {
  return getCityDef(activeCityId);
}

/**
 * Display name of the player's active realm ("MINX CITY", "HUDA CITY", …).
 * Single source for all in-game chrome that labels "the current city". Reads
 * the active-city system (set from the player's save/travel), so it follows the
 * realm the player is actually in instead of a hardcoded constant. Defaults to
 * Minx until the active city is set, so existing single-city behavior is
 * unchanged.
 */
export function getActiveCityName(): string {
  return getActiveCityDef().name;
}

/**
 * Resolve and set the active city from the player's persisted state, so chrome
 * surfaces reached WITHOUT going through WorldPlay (office, terminal, profile,
 * maps…) still name the realm the player is actually in. Mirrors WorldPlay's
 * own resolution: a fresh city-to-city hand-off (`city_travel`, <60s) wins,
 * otherwise the city stored on the save (`sm_save.cityId`), else the default
 * (Minx). This is NOT a parallel source — it feeds the same active-city system.
 * Returns the resolved name for convenience.
 */
export function hydrateActiveCityFromSave(): string {
  if (typeof window === 'undefined') return getActiveCityName();
  try {
    const raw = window.localStorage.getItem('city_travel');
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j.cityId === 'string' && CITY_DEFS[j.cityId] && Date.now() - (j.at ?? 0) < 60_000) {
        return setActiveCityId(j.cityId).name;
      }
    }
  } catch { /* ignore malformed travel hand-off */ }
  try {
    const raw = window.localStorage.getItem('sm_save');
    if (raw) {
      const s = JSON.parse(raw);
      const cityId = getSavedCityId(s);
      if (cityId) return setActiveCityId(cityId).name;
    }
  } catch { /* ignore malformed save cache */ }
  return getActiveCityName();
}

/** Point-in-wall test for a walled city's collision (world coords). */
export function hitsCityWall(def: CityDef, x: number, y: number, pad = 0): boolean {
  if (!def.walls) return false;
  for (const w of def.walls) {
    if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) {
      return true;
    }
  }
  return false;
}
