// @vitest-environment jsdom
//
// Verifies the two independent enable gates that decide whether background audio
// is allowed to make sound AT ALL (separate from per-channel volume):
//   - AMBIANCE  -> the "music" channel (procedural ambient score). Default ON.
//   - SHADOW RADIO -> the "soundtrack" channel (Call Home tracks). Default OFF.
// When a gate is OFF its channel must report zero effective gain (so nothing is
// audible) AND, for AMBIANCE, the engine music volume must collapse to 0 even if
// the raw slider is up — that's what lets an in-game toggle silence the bed
// without touching the slider. Modules are reset so the store starts at defaults.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeAudioParam {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  cancelScheduledValues() { return this; }
  cancelAndHoldAtTime() { return this; }
}
class FakeGainNode { gain = new FakeAudioParam(); connect() { return this; } disconnect() {} }
class FakeOscillator {
  type = "sine"; frequency = new FakeAudioParam(); detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  connect() { return this; } start() {} stop() {} disconnect() {}
}
class FakeBufferSource {
  buffer: unknown = null; loop = false; onended: (() => void) | null = null;
  connect() { return this; } start() {} stop() {} disconnect() {}
}
class FakeBiquadFilter {
  type = "lowpass"; frequency = new FakeAudioParam(); Q = { value: 0 }; gain = new FakeAudioParam();
  connect() { return this; } disconnect() {}
}
class FakeAudioContext {
  state = "running"; currentTime = 0; sampleRate = 44100; destination = {};
  createGain() { return new FakeGainNode(); }
  createOscillator() { return new FakeOscillator(); }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new FakeBufferSource(); }
  createBiquadFilter() { return new FakeBiquadFilter(); }
  resume() {}
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  (globalThis as any).AudioContext = FakeAudioContext as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("audio enable gates (defaults)", () => {
  it("defaults: AMBIANCE on (music audible), MUSIC off (soundtrack silent)", async () => {
    const { channelGain, getAmbianceEnabled, getMusicEnabled } = await import("./audio-settings");
    expect(getAmbianceEnabled()).toBe(true);
    expect(getMusicEnabled()).toBe(false);
    expect(channelGain("music")).toBeGreaterThan(0);
    expect(channelGain("soundtrack")).toBe(0);
  });
});

describe("AMBIANCE gate", () => {
  it("silences the music channel + engine music vol when toggled off, restores on toggle on", async () => {
    const { setAudioSettings, channelGain } = await import("./audio-settings");
    const { getMusicVol } = await import("../soundEngine");

    setAudioSettings({ muted: false, master: 1, music: 0.6, ambianceEnabled: true });
    expect(channelGain("music")).toBeGreaterThan(0);
    expect(getMusicVol()).toBeGreaterThan(0);

    // Toggle AMBIANCE off: channel + engine collapse to 0 even though the slider is up.
    setAudioSettings({ ambianceEnabled: false });
    expect(channelGain("music")).toBe(0);
    expect(getMusicVol()).toBe(0);

    // Toggle back on: restored without touching the slider.
    setAudioSettings({ ambianceEnabled: true });
    expect(channelGain("music")).toBeGreaterThan(0);
    expect(getMusicVol()).toBeGreaterThan(0);
  });
});

describe("MUSIC gate", () => {
  it("keeps the soundtrack channel silent until explicitly enabled", async () => {
    const { setAudioSettings, channelGain } = await import("./audio-settings");

    setAudioSettings({ muted: false, master: 1, soundtrack: 0.5 });
    expect(channelGain("soundtrack")).toBe(0);

    setAudioSettings({ musicEnabled: true });
    expect(channelGain("soundtrack")).toBeGreaterThan(0);

    setAudioSettings({ musicEnabled: false });
    expect(channelGain("soundtrack")).toBe(0);
  });
});
