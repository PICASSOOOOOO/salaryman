import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeFpsCap,
  readFpsCap,
  frameIntervalForCap,
  DEFAULT_FPS_CAP,
  normalizeResolution,
  readResolution,
  effectiveDpr,
  DEFAULT_RESOLUTION,
  normalizeUiScale,
  readUiScale,
  DEFAULT_UI_SCALE,
  normalizeBloom,
  readBloomEnabled,
  DEFAULT_BLOOM,
  normalizeCinematic,
  readCinematicLetterbox,
  DEFAULT_CINEMATIC,
  cinematicBarHeight,
  type FpsCap,
  type Resolution,
} from "./graphics-quality";

// The remaining "Display" graphics-quality knobs (FPS cap, Resolution, UI scale,
// Bloom/glow, Cinematic letterbox) are persisted to sm_game_settings_v1 but the
// city render loop only takes effect through these pure readers/helpers. They are
// the single source of truth for the loop's gates, so a future refactor can't
// silently break a performance toggle without tripping a test. Every default
// must reproduce the loop's prior behaviour exactly.

const STORE_KEY = "sm_game_settings_v1";

// ── FPS cap ───────────────────────────────────────────────────────────────────
describe("normalizeFpsCap — coercing persisted values", () => {
  it("accepts every valid tier verbatim (incl. 0 = uncapped)", () => {
    for (const cap of [30, 60, 120, 0] as FpsCap[]) {
      expect(normalizeFpsCap(cap)).toBe(cap);
    }
  });

  it("collapses anything unrecognised to the default (120)", () => {
    for (const bad of [undefined, null, "", "60", 45, 144, 24, {}, [], NaN]) {
      expect(normalizeFpsCap(bad)).toBe(DEFAULT_FPS_CAP);
    }
  });
});

describe("readFpsCap — parsing sm_game_settings_v1", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("defaults to 120 when the blob is missing or lacks the key", () => {
    expect(readFpsCap()).toBe(120);
    localStorage.setItem(STORE_KEY, JSON.stringify({ cameraZoom: 3.2 }));
    expect(readFpsCap()).toBe(120);
  });

  it("reads each saved cap", () => {
    for (const cap of [30, 60, 0] as FpsCap[]) {
      localStorage.setItem(STORE_KEY, JSON.stringify({ fpsCap: cap }));
      expect(readFpsCap()).toBe(cap);
    }
  });

  it("falls back to 120 on unparseable JSON / storage errors", () => {
    localStorage.setItem(STORE_KEY, "{not json");
    expect(readFpsCap()).toBe(120);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readFpsCap()).toBe(120);
  });
});

describe("frameIntervalForCap — min ms between rendered frames", () => {
  it("returns 0 (never throttles) when uncapped", () => {
    expect(frameIntervalForCap(0)).toBe(0);
  });

  it("the default (120) never throttles a 60Hz display", () => {
    // 60Hz RAF fires ~16.67ms apart; a 120 cap interval must be well under it.
    expect(frameIntervalForCap(120)).toBeLessThan(16.67);
  });

  it("a 60 cap does not drop frames on a 60Hz panel (tolerance protects vsync)", () => {
    // 16.67ms RAF >= interval -> every frame renders -> a true 60fps.
    expect(16.67).toBeGreaterThanOrEqual(frameIntervalForCap(60));
  });

  it("a 30 cap forces skipping every other 60Hz frame", () => {
    const interval = frameIntervalForCap(30);
    expect(16.67).toBeLessThan(interval);   // one 60Hz frame is too soon
    expect(33.34).toBeGreaterThan(interval); // two 60Hz frames clears it
  });

  it("lower caps produce strictly larger intervals", () => {
    expect(frameIntervalForCap(30)).toBeGreaterThan(frameIntervalForCap(60));
    expect(frameIntervalForCap(60)).toBeGreaterThan(frameIntervalForCap(120));
  });

  it("never returns a negative interval", () => {
    expect(frameIntervalForCap(120, 1000)).toBe(0);
  });
});

// ── Resolution ─────────────────────────────────────────────────────────────────
describe("normalizeResolution / readResolution", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("accepts the fixed tiers verbatim", () => {
    for (const r of ["720p", "1080p", "1440p"] as Resolution[]) {
      expect(normalizeResolution(r)).toBe(r);
    }
  });

  it("collapses anything unrecognised to 'auto'", () => {
    for (const bad of [undefined, null, "", "AUTO", "4k", 1080, {}, []]) {
      expect(normalizeResolution(bad)).toBe(DEFAULT_RESOLUTION);
    }
  });

  it("defaults to 'auto' when missing, reads a saved tier otherwise", () => {
    expect(readResolution()).toBe("auto");
    localStorage.setItem(STORE_KEY, JSON.stringify({ resolution: "1080p" }));
    expect(readResolution()).toBe("1080p");
  });
});

describe("effectiveDpr — backing-canvas DPR cap", () => {
  it("'auto' reproduces the old min(devicePixelRatio, 2) exactly", () => {
    expect(effectiveDpr("auto", 1, 800)).toBe(1);
    expect(effectiveDpr("auto", 2, 800)).toBe(2);
    expect(effectiveDpr("auto", 3, 800)).toBe(2); // clamped to historical ceiling
  });

  it("caps the backing buffer to the target height on a tall viewport (cheaper)", () => {
    // 720p target on an 800px canvas -> 0.9 dpr, below native 1-2.
    expect(effectiveDpr("720p", 2, 800)).toBeCloseTo(0.9, 5);
  });

  it("never upscales past the native/2 ceiling", () => {
    // 1440p target on a short 600px canvas would be 2.4, but native/2 = 2 caps it.
    expect(effectiveDpr("1440p", 2, 600)).toBe(2);
  });

  it("a higher tier allows a higher dpr than a lower tier for the same viewport", () => {
    const lo = effectiveDpr("720p", 2, 1000);
    const hi = effectiveDpr("1440p", 2, 1000);
    expect(hi).toBeGreaterThan(lo);
  });

  it("floors at 0.5 and tolerates bad inputs", () => {
    expect(effectiveDpr("720p", 2, 100000)).toBe(0.5); // would-be tiny -> floored
    expect(effectiveDpr("720p", 2, 0)).toBe(2);        // bad height -> native ceiling
    expect(effectiveDpr("auto", 0, 800)).toBe(1);      // bad dpr -> treated as 1
  });
});

// ── UI scale ───────────────────────────────────────────────────────────────────
describe("normalizeUiScale / readUiScale", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("passes valid in-range scales through", () => {
    expect(normalizeUiScale(1.0)).toBe(1.0);
    expect(normalizeUiScale(0.8)).toBe(0.8);
    expect(normalizeUiScale(1.4)).toBe(1.4);
    expect(normalizeUiScale(1.15)).toBe(1.15);
  });

  it("clamps out-of-range values to the [0.8, 1.4] band", () => {
    expect(normalizeUiScale(0.1)).toBe(0.8);
    expect(normalizeUiScale(5)).toBe(1.4);
  });

  it("defaults to 1.0 (an exact no-op) on bad input", () => {
    for (const bad of [undefined, null, "1.2", NaN, Infinity, {}, []]) {
      expect(normalizeUiScale(bad)).toBe(DEFAULT_UI_SCALE);
    }
  });

  it("reads a saved scale, defaults to 1.0 when missing", () => {
    expect(readUiScale()).toBe(1.0);
    localStorage.setItem(STORE_KEY, JSON.stringify({ uiScale: 1.25 }));
    expect(readUiScale()).toBe(1.25);
  });
});

// ── Bloom / glow ────────────────────────────────────────────────────────────────
describe("normalizeBloom / readBloomEnabled", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("only an explicit false disables bloom (default ON)", () => {
    expect(normalizeBloom(false)).toBe(false);
    expect(normalizeBloom(true)).toBe(true);
    for (const other of [undefined, null, 0, "", "false"]) {
      expect(normalizeBloom(other)).toBe(DEFAULT_BLOOM); // true
    }
  });

  it("defaults to ON when missing, reads a saved false", () => {
    expect(readBloomEnabled()).toBe(true);
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false }));
    expect(readBloomEnabled()).toBe(false);
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    expect(readBloomEnabled()).toBe(true);
  });
});

// ── Cinematic letterbox ──────────────────────────────────────────────────────────
describe("normalizeCinematic / readCinematicLetterbox", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("only an explicit false disables the bars (default ON)", () => {
    expect(normalizeCinematic(false)).toBe(false);
    expect(normalizeCinematic(true)).toBe(true);
    expect(normalizeCinematic(undefined)).toBe(DEFAULT_CINEMATIC);
  });

  it("defaults to ON, reads a saved false", () => {
    expect(readCinematicLetterbox()).toBe(true);
    localStorage.setItem(STORE_KEY, JSON.stringify({ cinematic: false }));
    expect(readCinematicLetterbox()).toBe(false);
  });
});

describe("cinematicBarHeight — letterbox bar size", () => {
  it("is ~7% of the canvas height per bar", () => {
    expect(cinematicBarHeight(1000)).toBe(70);
    expect(cinematicBarHeight(720)).toBe(Math.round(720 * 0.07));
  });

  it("leaves the bulk of the frame visible (two bars < half the height)", () => {
    const h = 900;
    expect(cinematicBarHeight(h) * 2).toBeLessThan(h / 2);
  });

  it("returns 0 for degenerate heights", () => {
    expect(cinematicBarHeight(0)).toBe(0);
    expect(cinematicBarHeight(-100)).toBe(0);
    expect(cinematicBarHeight(NaN)).toBe(0);
  });
});

// ── Defaults preserve current behaviour exactly ───────────────────────────────────
describe("a fresh save (no settings written) renders identically to before", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("every default is the historical no-op value", () => {
    expect(readFpsCap()).toBe(120);
    expect(frameIntervalForCap(readFpsCap())).toBeLessThan(16.67); // never throttles ≤120Hz
    expect(readResolution()).toBe("auto");
    expect(effectiveDpr(readResolution(), 2, 800)).toBe(2);        // old min(dpr,2)
    expect(readUiScale()).toBe(1.0);                                // zoom no-op
    expect(readBloomEnabled()).toBe(true);                          // full glow pass
    expect(readCinematicLetterbox()).toBe(true);                    // bars during cutscene
  });
});
