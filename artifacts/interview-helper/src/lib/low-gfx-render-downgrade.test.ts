import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readBloomEnabled,
  lowGfxEnabled as gfxLowGfxEnabled,
  readFpsCap,
  readSavedFpsCap,
  applyLowGfxFpsCap,
  frameIntervalForCap,
  readResolution,
  readSavedResolution,
  applyLowGfxResolutionCap,
  effectiveDpr,
  type FpsCap,
  type Resolution,
} from "./graphics-quality";
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

describe("applyLowGfxFpsCap — frame-rate clamp (pure)", () => {
  it("is a no-op when low-graphics is OFF", () => {
    for (const c of [30, 60, 120, 0] as FpsCap[]) {
      expect(applyLowGfxFpsCap(c, false)).toBe(c);
    }
  });

  it("caps the heavier rates (120 / uncapped) down to 60 but never raises a lighter one", () => {
    expect(applyLowGfxFpsCap(0, true)).toBe(60);   // uncapped -> 60
    expect(applyLowGfxFpsCap(120, true)).toBe(60); // 120 -> 60
    expect(applyLowGfxFpsCap(60, true)).toBe(60);  // already at cap
    expect(applyLowGfxFpsCap(30, true)).toBe(30);  // lighter choice preserved
  });
});

describe("low-graphics downgrades the FPS cap (graphics-quality)", () => {
  it("drops the default (uncapped 120) to 60", () => {
    expect(readFpsCap()).toBe(120); // rich default
    setLowGfx(true);
    expect(readFpsCap()).toBe(60);
  });

  it("drops an explicit uncapped (0) choice to 60", () => {
    setSettings({ fpsCap: 0 });
    expect(readFpsCap()).toBe(0);
    setLowGfx(true);
    expect(readFpsCap()).toBe(60);
  });

  it("leaves an already-lighter 30fps player at 30 (never upgrades them)", () => {
    setSettings({ fpsCap: 30 });
    setLowGfx(true);
    expect(readFpsCap()).toBe(30);
  });

  it("turning low-graphics OFF restores the player's saved cap", () => {
    setSettings({ fpsCap: 120 });
    setLowGfx(true);
    expect(readFpsCap()).toBe(60);
    setLowGfx(false);
    expect(readFpsCap()).toBe(120);
  });

  it("never changes the SAVED choice — only the effective value", () => {
    setSettings({ fpsCap: 0 });
    setLowGfx(true);
    expect(readSavedFpsCap()).toBe(0); // Settings dropdown still shows the real choice
    expect(readFpsCap()).toBe(60);     // loop consumes the capped value
  });

  it("the capped rate genuinely throttles more than the uncapped default", () => {
    setSettings({ fpsCap: 0 });
    const uncapped = frameIntervalForCap(readFpsCap()); // 0 = never skips
    setLowGfx(true);
    const capped = frameIntervalForCap(readFpsCap());   // 60fps interval > 0
    expect(capped).toBeGreaterThan(uncapped);
  });
});

describe("applyLowGfxResolutionCap — resolution clamp (pure)", () => {
  it("is a no-op when low-graphics is OFF", () => {
    for (const r of ["auto", "720p", "1080p", "1440p"] as Resolution[]) {
      expect(applyLowGfxResolutionCap(r, false)).toBe(r);
    }
  });

  it("caps the heavier tiers (auto / 1440p) down to 1080p but never raises a lighter one", () => {
    expect(applyLowGfxResolutionCap("auto", true)).toBe("1080p");
    expect(applyLowGfxResolutionCap("1440p", true)).toBe("1080p");
    expect(applyLowGfxResolutionCap("1080p", true)).toBe("1080p"); // already at cap
    expect(applyLowGfxResolutionCap("720p", true)).toBe("720p");   // lighter choice preserved
  });
});

describe("low-graphics downgrades the RESOLUTION (graphics-quality)", () => {
  it("drops the default ('auto', native/2) to 1080p", () => {
    expect(readResolution()).toBe("auto"); // rich default
    setLowGfx(true);
    expect(readResolution()).toBe("1080p");
  });

  it("drops an explicit 1440p choice to 1080p", () => {
    setSettings({ resolution: "1440p" });
    expect(readResolution()).toBe("1440p");
    setLowGfx(true);
    expect(readResolution()).toBe("1080p");
  });

  it("leaves an already-lighter 720p player at 720p (never upgrades them)", () => {
    setSettings({ resolution: "720p" });
    setLowGfx(true);
    expect(readResolution()).toBe("720p");
  });

  it("turning low-graphics OFF restores the player's saved resolution", () => {
    setSettings({ resolution: "auto" });
    setLowGfx(true);
    expect(readResolution()).toBe("1080p");
    setLowGfx(false);
    expect(readResolution()).toBe("auto");
  });

  it("never changes the SAVED choice — only the effective value", () => {
    setSettings({ resolution: "1440p" });
    setLowGfx(true);
    expect(readSavedResolution()).toBe("1440p"); // Settings dropdown still shows the real choice
    expect(readResolution()).toBe("1080p");      // loop consumes the capped value
  });

  it("the capped resolution renders fewer backing pixels than the auto default on a tall high-DPR viewport", () => {
    // A tall phone canvas at native DPR 3: 'auto' clamps to 2 (1600px backing),
    // capped 1080p targets 1080/800 = 1.35 dpr (1080px backing) — strictly fewer.
    const cssHeight = 800;
    const nativeDpr = 3;
    const autoDpr = effectiveDpr("auto", nativeDpr, cssHeight);
    setLowGfx(true);
    const cappedDpr = effectiveDpr(readResolution(), nativeDpr, cssHeight);
    expect(cappedDpr).toBeLessThan(autoDpr);
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
