import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readBloomEnabled, lowGfxEnabled as gfxLowGfxEnabled } from "./graphics-quality";
import {
  readWeatherQuality,
  applyLowGfxWeatherCap,
  weatherCaps,
  lowGfxEnabled as weatherLowGfxEnabled,
  type WeatherQuality,
} from "./weather-quality";

// Task #503 proved the cross-tab SYNC of the low-graphics preference (the
// useLowGfx hook + <html class="low-gfx"> toggling). This suite proves the layer
// that READS that preference to actually downgrade visuals: turning low-graphics
// ON must feed through graphics-quality.ts / weather-quality.ts so the helpers
// the render loop consumes report a strictly REDUCED quality tier (no neon bloom
// pass, thinner weather particle/ripple budget). Without this, a regression
// would leave the toggle visually inert while still flipping the class.

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

function setLowGfx(on: boolean) {
  if (on) localStorage.setItem(LOW_GFX_KEY, "1");
  else localStorage.removeItem(LOW_GFX_KEY);
}

function setSettings(blob: Record<string, unknown>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(blob));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("lowGfxEnabled — shared master-switch reader", () => {
  it("is the same flag in both quality modules", () => {
    expect(gfxLowGfxEnabled()).toBe(false);
    expect(weatherLowGfxEnabled()).toBe(false);
    setLowGfx(true);
    expect(gfxLowGfxEnabled()).toBe(true);
    expect(weatherLowGfxEnabled()).toBe(true);
  });

  it("only the exact '1' value enables it", () => {
    for (const v of ["", "0", "true", "yes", "01"]) {
      localStorage.setItem(LOW_GFX_KEY, v);
      expect(gfxLowGfxEnabled()).toBe(false);
    }
    setLowGfx(true);
    expect(gfxLowGfxEnabled()).toBe(true);
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(gfxLowGfxEnabled()).toBe(false);
    expect(weatherLowGfxEnabled()).toBe(false);
  });
});

describe("low-graphics downgrades the BLOOM pass (graphics-quality)", () => {
  it("forces bloom OFF even when nothing else is set (fresh save)", () => {
    expect(readBloomEnabled()).toBe(true); // rich default
    setLowGfx(true);
    expect(readBloomEnabled()).toBe(false);
  });

  it("overrides an explicit bloom:true in the Display settings", () => {
    setSettings({ bloom: true });
    expect(readBloomEnabled()).toBe(true);
    setLowGfx(true);
    expect(readBloomEnabled()).toBe(false); // master switch wins
  });

  it("turning low-graphics OFF restores the higher tier (bloom back ON)", () => {
    setSettings({ bloom: true });
    setLowGfx(true);
    expect(readBloomEnabled()).toBe(false);
    setLowGfx(false);
    expect(readBloomEnabled()).toBe(true);
  });

  it("a user who already disabled bloom stays disabled regardless of low-gfx", () => {
    setSettings({ bloom: false });
    expect(readBloomEnabled()).toBe(false);
    setLowGfx(true);
    expect(readBloomEnabled()).toBe(false);
    setLowGfx(false);
    expect(readBloomEnabled()).toBe(false);
  });
});

describe("applyLowGfxWeatherCap — tier clamp (pure)", () => {
  it("is a no-op when low-graphics is OFF", () => {
    for (const q of ["full", "reduced", "off"] as WeatherQuality[]) {
      expect(applyLowGfxWeatherCap(q, false)).toBe(q);
    }
  });

  it("caps 'full' down to 'reduced' but never raises a lower tier", () => {
    expect(applyLowGfxWeatherCap("full", true)).toBe("reduced");
    expect(applyLowGfxWeatherCap("reduced", true)).toBe("reduced");
    expect(applyLowGfxWeatherCap("off", true)).toBe("off"); // never upgraded
  });
});

describe("low-graphics downgrades WEATHER effects (weather-quality)", () => {
  it("drops the default 'full' tier to 'reduced' (fewer particles)", () => {
    expect(readWeatherQuality()).toBe("full");
    setLowGfx(true);
    expect(readWeatherQuality()).toBe("reduced");
  });

  it("drops an explicit 'full' setting to 'reduced'", () => {
    setSettings({ weatherEffects: "full" });
    expect(readWeatherQuality()).toBe("full");
    setLowGfx(true);
    expect(readWeatherQuality()).toBe("reduced");
  });

  it("leaves an already-'off' player at 'off' (never upgrades them)", () => {
    setSettings({ weatherEffects: "off" });
    setLowGfx(true);
    expect(readWeatherQuality()).toBe("off");
  });

  it("leaves an already-'reduced' player at 'reduced'", () => {
    setSettings({ weatherEffects: "reduced" });
    setLowGfx(true);
    expect(readWeatherQuality()).toBe("reduced");
  });

  it("turning low-graphics OFF restores the higher tier ('full' back)", () => {
    setSettings({ weatherEffects: "full" });
    setLowGfx(true);
    expect(readWeatherQuality()).toBe("reduced");
    setLowGfx(false);
    expect(readWeatherQuality()).toBe("full");
  });

  it("the reduced tier genuinely spawns FEWER particles/ripples than full", () => {
    setSettings({ weatherEffects: "full" });
    const full = weatherCaps(readWeatherQuality());
    setLowGfx(true);
    const low = weatherCaps(readWeatherQuality());
    expect(low.particleCap).toBeLessThan(full.particleCap);
    expect(low.particlesPerSpawn).toBeLessThan(full.particlesPerSpawn);
    expect(low.rippleCap).toBeLessThan(full.rippleCap);
    expect(low.ripplesPerSpawn).toBeLessThan(full.ripplesPerSpawn);
  });
});

describe("end-to-end: flipping low-graphics measurably reduces the render", () => {
  it("OFF -> ON downgrades both bloom and weather together", () => {
    setSettings({ bloom: true, weatherEffects: "full" });
    // Baseline (high tier).
    expect(readBloomEnabled()).toBe(true);
    expect(readWeatherQuality()).toBe("full");

    // Flip the master switch.
    setLowGfx(true);
    expect(readBloomEnabled()).toBe(false);
    expect(readWeatherQuality()).toBe("reduced");

    // Flip it back — both restore.
    setLowGfx(false);
    expect(readBloomEnabled()).toBe(true);
    expect(readWeatherQuality()).toBe("full");
  });
});
