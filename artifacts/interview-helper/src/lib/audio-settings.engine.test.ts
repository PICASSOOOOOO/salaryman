// @vitest-environment jsdom
//
// The SOUND-tab persistence tests (Settings.sound.test.tsx) prove the sliders
// SAVE to localStorage, but they mock the sound engine, so nothing verifies the
// store actually pushes the right GAINS into it. The loudness the player hears is
// decided by audio-settings' applyToEngine()/channelGain() math:
//
//   setSfxVolume   = sfx       * master * mute
//   setMusicVolume = music(AMB)* master * mute * ambianceGate * voiceDuck
//   channelGain    = channel   * master * voiceDuck   (gated by mute / enable)
//
// Those products have subtle branches (mute zeroes everything; the ambiance gate
// silences the procedural bed; voice ducking drops music + soundtrack to zero;
// the soundtrack/music channels are gated by their enable flags). A regression in
// that math would not be caught by the persistence tests.
//
// Here the sound engine is STUBBED with vi.fn()s so we can read the EXACT numbers
// the store hands it. Modules are reset between tests so the store's module-level
// state, the voice bus, and the fresh stub fns all start clean.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));

// Re-imported per test (after vi.resetModules) so each test sees a clean store
// wired to the freshly-created stub fns. audio-settings calls applyToEngine() on
// load and on every setAudioSettings(), recording into these stubs.
type Engine = typeof import("../soundEngine");
type Settings = typeof import("./audio-settings");
type Bus = typeof import("./audio-bus");

async function load(): Promise<{ engine: Engine; settings: Settings; bus: Bus }> {
  // Import the stubbed engine FIRST so audio-settings binds to these same fns.
  const engine = await import("../soundEngine");
  const settings = await import("./audio-settings");
  const bus = await import("./audio-bus");
  return { engine, settings, bus };
}

// The argument of the most recent call to a stubbed engine setter.
function lastArg(fn: unknown): number {
  const mock = fn as { mock: { calls: unknown[][] } };
  const calls = mock.mock.calls;
  if (calls.length === 0) throw new Error("engine setter was never called");
  return calls[calls.length - 1][0] as number;
}

function lastBool(fn: unknown): boolean {
  const mock = fn as { mock: { calls: unknown[][] } };
  const calls = mock.mock.calls;
  if (calls.length === 0) throw new Error("engine setter was never called");
  return calls[calls.length - 1][0] as boolean;
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyToEngine pushes the correct gains into the sound engine", () => {
  it("normal state: sfx = sfx*master, music = ambiance*master, not muted", async () => {
    const { engine, settings } = await load();

    settings.setAudioSettings({
      muted: false, master: 1, music: 0.5, sfx: 0.8, voice: 1, soundtrack: 0.3,
      musicEnabled: true, ambianceEnabled: true,
    });

    expect(lastArg(engine.setSfxVolume)).toBeCloseTo(0.8 * 1);
    expect(lastArg(engine.setMusicVolume)).toBeCloseTo(0.5 * 1);
    expect(lastBool(engine.setMuted)).toBe(false);
  });

  it("scales every channel by master together", async () => {
    const { engine, settings } = await load();

    settings.setAudioSettings({
      muted: false, master: 0.5, music: 0.6, sfx: 0.8, ambianceEnabled: true,
    });

    expect(lastArg(engine.setSfxVolume)).toBeCloseTo(0.8 * 0.5);
    expect(lastArg(engine.setMusicVolume)).toBeCloseTo(0.6 * 0.5);
  });

  it("muted state: every gain is zeroed and the engine mute flag is set", async () => {
    const { engine, settings } = await load();

    settings.setAudioSettings({
      muted: true, master: 1, music: 0.5, sfx: 0.8, ambianceEnabled: true,
    });

    expect(lastArg(engine.setSfxVolume)).toBe(0);
    expect(lastArg(engine.setMusicVolume)).toBe(0);
    expect(lastBool(engine.setMuted)).toBe(true);
  });

  it("ambiance-off: the procedural bed is silenced but sfx is untouched", async () => {
    const { engine, settings } = await load();

    settings.setAudioSettings({
      muted: false, master: 1, music: 0.5, sfx: 0.8, ambianceEnabled: false,
    });

    expect(lastArg(engine.setMusicVolume)).toBe(0);
    expect(lastArg(engine.setSfxVolume)).toBeCloseTo(0.8 * 1);
  });

  it("voice-ducked: music drops to zero, sfx stays, restores on release", async () => {
    const { engine, settings, bus } = await load();

    settings.setAudioSettings({
      muted: false, master: 1, music: 0.5, sfx: 0.8, ambianceEnabled: true,
    });
    // Baseline: the ambient bed is audible.
    expect(lastArg(engine.setMusicVolume)).toBeCloseTo(0.5 * 1);

    const release = bus.acquireVoicePriority();
    // While a voice speaks the bed ducks to silence...
    expect(lastArg(engine.setMusicVolume)).toBe(0);
    // ...but sfx is never ducked.
    expect(lastArg(engine.setSfxVolume)).toBeCloseTo(0.8 * 1);

    release();
    // Restored to the user's level the instant the voice ends.
    expect(lastArg(engine.setMusicVolume)).toBeCloseTo(0.5 * 1);
  });
});

describe("channelGain honors the music / soundtrack gates", () => {
  it("zeroes every channel while muted", async () => {
    const { settings } = await load();

    settings.setAudioSettings({
      muted: true, master: 1, music: 0.6, sfx: 0.8, voice: 1, soundtrack: 0.4,
      musicEnabled: true, ambianceEnabled: true,
    });

    expect(settings.channelGain("master")).toBe(0);
    expect(settings.channelGain("music")).toBe(0);
    expect(settings.channelGain("sfx")).toBe(0);
    expect(settings.channelGain("voice")).toBe(0);
    expect(settings.channelGain("soundtrack")).toBe(0);
  });

  it("gates the AMBIANCE (music) channel on ambianceEnabled", async () => {
    const { settings } = await load();

    settings.setAudioSettings({ muted: false, master: 1, music: 0.6, ambianceEnabled: false });
    expect(settings.channelGain("music")).toBe(0);

    settings.setAudioSettings({ ambianceEnabled: true });
    expect(settings.channelGain("music")).toBeCloseTo(0.6 * 1);
  });

  it("gates the MUSIC (soundtrack) channel on musicEnabled", async () => {
    const { settings } = await load();

    settings.setAudioSettings({ muted: false, master: 1, soundtrack: 0.4, musicEnabled: false });
    expect(settings.channelGain("soundtrack")).toBe(0);

    settings.setAudioSettings({ musicEnabled: true });
    expect(settings.channelGain("soundtrack")).toBeCloseTo(0.4 * 1);
  });

  it("scales an enabled channel by master and clamps to [0,1]", async () => {
    const { settings } = await load();

    settings.setAudioSettings({ muted: false, master: 0.5, soundtrack: 0.4, musicEnabled: true });
    expect(settings.channelGain("soundtrack")).toBeCloseTo(0.4 * 0.5);

    // master * channel can exceed 1 — channelGain clamps it.
    settings.setAudioSettings({ master: 1, soundtrack: 1 });
    expect(settings.channelGain("soundtrack")).toBe(1);
  });

  it("ducks the music + soundtrack channels (not sfx/voice) while a voice speaks", async () => {
    const { settings, bus } = await load();

    settings.setAudioSettings({
      muted: false, master: 1, music: 0.6, sfx: 0.8, voice: 1, soundtrack: 0.4,
      musicEnabled: true, ambianceEnabled: true,
    });

    const release = bus.acquireVoicePriority();
    expect(settings.channelGain("music")).toBe(0);
    expect(settings.channelGain("soundtrack")).toBe(0);
    expect(settings.channelGain("sfx")).toBeCloseTo(0.8 * 1);
    expect(settings.channelGain("voice")).toBeCloseTo(1 * 1);
    release();

    expect(settings.channelGain("music")).toBeCloseTo(0.6 * 1);
    expect(settings.channelGain("soundtrack")).toBeCloseTo(0.4 * 1);
  });
});
