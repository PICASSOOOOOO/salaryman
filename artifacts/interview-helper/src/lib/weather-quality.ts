// WEATHER EFFECTS quality toggle (Settings -> Display -> "Weather effects").
//
// The city render loop spawns falling-rain/snow particles and expanding puddle
// ripples, and smears wet-street neon reflections during rain. On lower-end
// devices that particle/reflection churn is the most expensive ambient effect,
// so players can dial it down ("Reduced") or off it entirely ("Off").
//
// This module is the single, pure source of truth for that toggle so the spawn
// caps and clear-on-off behaviour can be unit-tested without standing up the
// whole WorldPlay render loop. WorldPlay reads the saved quality, applies the
// caps when spawning, and clears any live effects the moment the player picks
// "Off".

// Shared persistence key with Game/Settings.tsx + the audio store. This module
// only ever READS the blob (Settings owns writes), so it never clobbers the
// other keys living under the same key.
const STORE_KEY = 'sm_game_settings_v1';

export type WeatherQuality = 'full' | 'reduced' | 'off';

// Anything missing or unrecognised falls back to the richest setting so a
// corrupt/older save never silently disables the ambient weather.
export const DEFAULT_WEATHER_QUALITY: WeatherQuality = 'full';

// Coerce an arbitrary persisted value into a known quality. Only the two
// non-default tiers are accepted verbatim; everything else (undefined, a typo,
// a number, an object) collapses to the default.
export function normalizeWeatherQuality(v: unknown): WeatherQuality {
  return v === 'reduced' || v === 'off' ? v : DEFAULT_WEATHER_QUALITY;
}

// Reads the saved Weather effects preference from sm_game_settings_v1. Returns
// the default ('full') when the blob is missing, unparseable, or lacks/has an
// invalid weatherEffects value.
export function readWeatherQuality(): WeatherQuality {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_WEATHER_QUALITY;
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_WEATHER_QUALITY;
    const parsed = JSON.parse(raw) as { weatherEffects?: unknown };
    return normalizeWeatherQuality(parsed.weatherEffects);
  } catch {
    return DEFAULT_WEATHER_QUALITY;
  }
}

// Per-tier spawn budget. `full` matches the original hardcoded loop caps so the
// default behaviour is unchanged; `reduced` is strictly lower across the board;
// `off` is all zeros so nothing new ever spawns.
export interface WeatherCaps {
  // Max live falling particles before spawning pauses.
  particleCap: number;
  // Particles added per spawn tick.
  particlesPerSpawn: number;
  // Max live puddle ripples before spawning pauses.
  rippleCap: number;
  // Ripples added per spawn tick.
  ripplesPerSpawn: number;
}

const CAPS: Record<WeatherQuality, WeatherCaps> = {
  full: { particleCap: 60, particlesPerSpawn: 8, rippleCap: 26, ripplesPerSpawn: 2 },
  reduced: { particleCap: 24, particlesPerSpawn: 3, rippleCap: 10, ripplesPerSpawn: 1 },
  off: { particleCap: 0, particlesPerSpawn: 0, rippleCap: 0, ripplesPerSpawn: 0 },
};

// Returns the spawn budget for a quality tier.
export function weatherCaps(q: WeatherQuality): WeatherCaps {
  return CAPS[q];
}

// True when ambient weather effects (particles, ripples, wet-street neon
// reflections) should render at all. False only for 'off'.
export function weatherEffectsEnabled(q: WeatherQuality): boolean {
  return q !== 'off';
}

// Empties the live effect buffers in place when the quality is 'off' so the
// player sees existing rain/snow/ripples vanish immediately on toggling off
// (mutates the passed arrays — they are the engine's live buffers). Returns
// true when a clear happened, false otherwise.
export function clearWeatherEffects(
  q: WeatherQuality,
  particles: unknown[],
  ripples: unknown[],
): boolean {
  if (q !== 'off') return false;
  particles.length = 0;
  ripples.length = 0;
  return true;
}
