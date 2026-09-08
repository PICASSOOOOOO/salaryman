import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readWeatherQuality,
  normalizeWeatherQuality,
  weatherCaps,
  weatherEffectsEnabled,
  clearWeatherEffects,
  DEFAULT_WEATHER_QUALITY,
  type WeatherQuality,
} from "./weather-quality";

// The "Weather effects" setting (Settings -> Display, Full / Reduced / Off)
// gates the city render loop's rain/snow particle + puddle-ripple spawn caps,
// the wet-street neon reflections, and clears any live effects on "Off". These
// pure helpers are the single source of truth for that behaviour so a future
// refactor of the WorldPlay render loop can't silently break the performance
// toggle without tripping a test.

const STORE_KEY = "sm_game_settings_v1";

describe("normalizeWeatherQuality — coercing persisted values", () => {
  it("accepts the two non-default tiers verbatim", () => {
    expect(normalizeWeatherQuality("reduced")).toBe("reduced");
    expect(normalizeWeatherQuality("off")).toBe("off");
  });

  it("passes 'full' through (it is the default)", () => {
    expect(normalizeWeatherQuality("full")).toBe("full");
  });

  it("collapses anything unrecognised to the default", () => {
    for (const bad of [undefined, null, "", "FULL", "Off", "high", 2, {}, []]) {
      expect(normalizeWeatherQuality(bad)).toBe(DEFAULT_WEATHER_QUALITY);
    }
  });
});

describe("readWeatherQuality — parsing sm_game_settings_v1", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to 'full' when the blob is missing", () => {
    expect(localStorage.getItem(STORE_KEY)).toBeNull();
    expect(readWeatherQuality()).toBe("full");
  });

  it("defaults to 'full' when the blob has no weatherEffects key", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cameraZoom: 3.2 }));
    expect(readWeatherQuality()).toBe("full");
  });

  it("reads a saved 'reduced' setting", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ weatherEffects: "reduced" }));
    expect(readWeatherQuality()).toBe("reduced");
  });

  it("reads a saved 'off' setting", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ weatherEffects: "off" }));
    expect(readWeatherQuality()).toBe("off");
  });

  it("falls back to 'full' on an invalid weatherEffects value", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ weatherEffects: "potato" }));
    expect(readWeatherQuality()).toBe("full");
  });

  it("falls back to 'full' on unparseable JSON", () => {
    localStorage.setItem(STORE_KEY, "{not valid json");
    expect(readWeatherQuality()).toBe("full");
  });

  it("falls back to 'full' when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(readWeatherQuality()).toBe("full");
  });
});

describe("weatherCaps — spawn budgets per tier", () => {
  it("'off' zeroes every spawn budget so nothing new ever spawns", () => {
    const off = weatherCaps("off");
    expect(off.particleCap).toBe(0);
    expect(off.particlesPerSpawn).toBe(0);
    expect(off.rippleCap).toBe(0);
    expect(off.ripplesPerSpawn).toBe(0);
  });

  it("'reduced' uses strictly lower caps than 'full' across the board", () => {
    const full = weatherCaps("full");
    const reduced = weatherCaps("reduced");
    expect(reduced.particleCap).toBeLessThan(full.particleCap);
    expect(reduced.particlesPerSpawn).toBeLessThan(full.particlesPerSpawn);
    expect(reduced.rippleCap).toBeLessThan(full.rippleCap);
    expect(reduced.ripplesPerSpawn).toBeLessThan(full.ripplesPerSpawn);
  });

  it("'full' preserves the original hardcoded loop caps (no behaviour change at default)", () => {
    const full = weatherCaps("full");
    expect(full.particleCap).toBe(60);
    expect(full.particlesPerSpawn).toBe(8);
    expect(full.rippleCap).toBe(26);
    expect(full.ripplesPerSpawn).toBe(2);
  });

  it("'reduced' and 'full' still allow spawning (non-zero caps)", () => {
    for (const q of ["full", "reduced"] as WeatherQuality[]) {
      const c = weatherCaps(q);
      expect(c.particleCap).toBeGreaterThan(0);
      expect(c.rippleCap).toBeGreaterThan(0);
      expect(c.particlesPerSpawn).toBeGreaterThan(0);
      expect(c.ripplesPerSpawn).toBeGreaterThan(0);
    }
  });
});

describe("weatherEffectsEnabled — wet-street neon / render gate", () => {
  it("is enabled for 'full' and 'reduced'", () => {
    expect(weatherEffectsEnabled("full")).toBe(true);
    expect(weatherEffectsEnabled("reduced")).toBe(true);
  });

  it("is disabled only for 'off'", () => {
    expect(weatherEffectsEnabled("off")).toBe(false);
  });
});

describe("clearWeatherEffects — clearing live buffers on 'off'", () => {
  it("empties both the particle and ripple buffers when 'off'", () => {
    const particles = [{ x: 1 }, { x: 2 }, { x: 3 }];
    const ripples = [{ r: 1 }, { r: 2 }];
    const cleared = clearWeatherEffects("off", particles, ripples);
    expect(cleared).toBe(true);
    expect(particles).toHaveLength(0);
    expect(ripples).toHaveLength(0);
  });

  it("mutates the SAME array references (engine live buffers, not copies)", () => {
    const particles: unknown[] = [{ x: 1 }];
    const ripples: unknown[] = [{ r: 1 }];
    const pRef = particles;
    const rRef = ripples;
    clearWeatherEffects("off", particles, ripples);
    expect(pRef).toBe(particles);
    expect(rRef).toBe(ripples);
    expect(pRef).toHaveLength(0);
    expect(rRef).toHaveLength(0);
  });

  it("leaves buffers untouched for 'full' and 'reduced'", () => {
    for (const q of ["full", "reduced"] as WeatherQuality[]) {
      const particles = [{ x: 1 }, { x: 2 }];
      const ripples = [{ r: 1 }];
      const cleared = clearWeatherEffects(q, particles, ripples);
      expect(cleared).toBe(false);
      expect(particles).toHaveLength(2);
      expect(ripples).toHaveLength(1);
    }
  });
});

describe("end-to-end: 'off' stops spawning AND clears existing effects", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("models the WorldPlay loop gate for an 'off' player", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ weatherEffects: "off" }));
    const q = readWeatherQuality();
    expect(q).toBe("off");

    // Live buffers from a prior 'full' session.
    const particles: unknown[] = [{ x: 1 }, { x: 2 }];
    const ripples: unknown[] = [{ r: 1 }];

    // The loop short-circuits spawning when clearWeatherEffects reports a clear.
    const didClear = clearWeatherEffects(q, particles, ripples);
    expect(didClear).toBe(true);
    expect(particles).toHaveLength(0);
    expect(ripples).toHaveLength(0);

    // And the caps guarantee no fresh spawns even if the loop continued.
    const caps = weatherCaps(q);
    expect(particles.length < caps.particleCap).toBe(false); // 0 < 0 -> never spawns
    expect(ripples.length < caps.rippleCap).toBe(false);
  });

  it("models the WorldPlay loop gate for a 'full' player (spawning continues)", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ weatherEffects: "full" }));
    const q = readWeatherQuality();
    const particles: unknown[] = [];
    const ripples: unknown[] = [];
    const didClear = clearWeatherEffects(q, particles, ripples);
    expect(didClear).toBe(false);
    const caps = weatherCaps(q);
    expect(particles.length < caps.particleCap).toBe(true); // room to spawn
    expect(ripples.length < caps.rippleCap).toBe(true);
  });
});
