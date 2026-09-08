// @vitest-environment jsdom
//
// The engine/gate tests prove that toggles WRITE the right keys into
// sm_game_settings_v1, but nothing verifies the READ-BACK path: that a saved
// blob is correctly rehydrated into the in-memory store on a fresh module load
// (readPersisted in audio-settings.ts). The store keeps module-level state, so a
// regression in readPersisted (wrong key name, bad type guard) would silently
// reset users' chosen music/ambiance/volume/mute settings to defaults on every
// reload, with no test to catch it.
//
// Here we seed sm_game_settings_v1 BEFORE importing the module, then force a cold
// import with vi.resetModules() so the store's `let state = readPersisted()`
// line runs against our blob. The sound engine is stubbed so the module's
// load-time applyToEngine() has nothing real to touch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

const STORE_KEY = "sm_game_settings_v1";

type Settings = typeof import("./audio-settings");

// Seed localStorage with `blob`, then cold-import audio-settings so its
// module-level readPersisted() runs against exactly that blob.
async function loadWith(blob: unknown): Promise<Settings> {
  if (blob !== undefined) {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(blob));
  }
  return import("./audio-settings");
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("audio settings survive a page reload (readPersisted rehydration)", () => {
  it("rehydrates every non-default volume channel from the persisted blob", async () => {
    const settings = await loadWith({
      masterVolume: 0.42,
      musicVolume: 0.31,
      sfxVolume: 0.55,
      voiceVolume: 0.6,
      soundtrackVolume: 0.77,
    });

    const s = settings.getAudioSettings();
    expect(s.master).toBeCloseTo(0.42);
    expect(s.music).toBeCloseTo(0.31);
    expect(s.sfx).toBeCloseTo(0.55);
    expect(s.voice).toBeCloseTo(0.6);
    expect(s.soundtrack).toBeCloseTo(0.77);
  });

  it("rehydrates the boolean gates (muted/musicEnabled/ambianceEnabled) opposite to defaults", async () => {
    // Defaults are muted:false, musicEnabled:false, ambianceEnabled:false — flip
    // all three so a gate that fails to read back would land on the default.
    const settings = await loadWith({
      audioMuted: true,
      musicEnabled: true,
      ambianceEnabled: false,
    });

    const s = settings.getAudioSettings();
    expect(s.muted).toBe(true);
    expect(s.musicEnabled).toBe(true);
    expect(s.ambianceEnabled).toBe(false);

    // The dedicated accessors must agree with the rehydrated state.
    expect(settings.getMusicEnabled()).toBe(true);
    expect(settings.getAmbianceEnabled()).toBe(false);
  });

  it("rehydrates a full opted-in blob so the accessors report the saved choices", async () => {
    const settings = await loadWith({
      masterVolume: 1,
      musicVolume: 0.5,
      sfxVolume: 0.9,
      voiceVolume: 1,
      soundtrackVolume: 0.4,
      audioMuted: false,
      musicEnabled: true,    // opted into the office radio
      ambianceEnabled: true,
    });

    expect(settings.getMusicEnabled()).toBe(true);
    expect(settings.getAmbianceEnabled()).toBe(true);
    // soundtrack (MUSIC) was opted in, so its channel is audible after reload.
    expect(settings.channelGain("soundtrack")).toBeCloseTo(0.4 * 1);
    expect(settings.channelGain("music")).toBeCloseTo(0.5 * 1);
  });
});

describe("malformed / partial blobs fall back to AUDIO_DEFAULTS per channel", () => {
  it("falls back to defaults for every key when the blob is empty", async () => {
    const settings = await loadWith({});
    const { AUDIO_DEFAULTS } = settings;
    expect(settings.getAudioSettings()).toEqual(AUDIO_DEFAULTS);
  });

  it("falls back per-channel: keeps the good keys, defaults the bad ones", async () => {
    const settings = await loadWith({
      masterVolume: 0.5,        // valid -> kept
      musicVolume: "loud",      // wrong type -> default
      sfxVolume: NaN,           // not finite -> default
      voiceVolume: null,        // missing -> default
      audioMuted: "yes",        // wrong type -> default (false)
      musicEnabled: 1,          // wrong type -> default (false)
      // ambianceEnabled omitted -> default (false)
    });

    const s = settings.getAudioSettings();
    const { AUDIO_DEFAULTS } = settings;
    expect(s.master).toBeCloseTo(0.5);
    expect(s.music).toBeCloseTo(AUDIO_DEFAULTS.music);
    expect(s.sfx).toBeCloseTo(AUDIO_DEFAULTS.sfx);
    expect(s.voice).toBeCloseTo(AUDIO_DEFAULTS.voice);
    expect(s.muted).toBe(AUDIO_DEFAULTS.muted);
    expect(s.musicEnabled).toBe(AUDIO_DEFAULTS.musicEnabled);
    expect(s.ambianceEnabled).toBe(AUDIO_DEFAULTS.ambianceEnabled);
  });

  it("falls back to all defaults when the stored value is not valid JSON", async () => {
    window.localStorage.setItem(STORE_KEY, "{not json at all");
    const settings = await import("./audio-settings");
    expect(settings.getAudioSettings()).toEqual(settings.AUDIO_DEFAULTS);
  });

  it("uses all defaults when nothing was ever persisted", async () => {
    const settings = await import("./audio-settings");
    expect(settings.getAudioSettings()).toEqual(settings.AUDIO_DEFAULTS);
  });
});
