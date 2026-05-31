// @vitest-environment jsdom
//
// Verifies that whenever a voice is speaking (Pablo / NPC TTS / phone — i.e.
// audio-bus voice priority is active) ALL background music is forced to silence,
// and restored the instant the voice finishes. Voice always wins, because TTS
// frequently fails silently when music plays over it.
//
// Exercises the real chain: audio-bus -> audio-settings -> soundEngine. Only the
// music-ish channels ("music" = ambient score, "soundtrack" = office radio) duck;
// "sfx" and "voice" are untouched. Modules are reset between tests so the
// store / engine / bus all start clean.
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

describe("voice priority ducks all background music", () => {
  it("drops music + soundtrack to zero while a voice speaks, restores after", async () => {
    const { acquireVoicePriority } = await import("./audio-bus");
    const { setAudioSettings, channelGain } = await import("./audio-settings");
    const { getMusicVol } = await import("../soundEngine");

    // MUSIC (soundtrack) is opt-in; enable it so it's audible at baseline. AMBIANCE
    // (music channel) is on by default.
    setAudioSettings({ muted: false, master: 1, music: 0.6, sfx: 0.9, voice: 1, soundtrack: 0.2, musicEnabled: true, ambianceEnabled: true });

    // Baseline: music is audible.
    expect(channelGain("music")).toBeGreaterThan(0);
    expect(channelGain("soundtrack")).toBeGreaterThan(0);
    expect(getMusicVol()).toBeGreaterThan(0);

    const release = acquireVoicePriority();

    // While the voice speaks: every music channel is silent...
    expect(channelGain("music")).toBe(0);
    expect(channelGain("soundtrack")).toBe(0);
    expect(getMusicVol()).toBe(0);
    // ...but sfx + voice are NOT ducked.
    expect(channelGain("sfx")).toBeGreaterThan(0);
    expect(channelGain("voice")).toBeGreaterThan(0);

    release();

    // Restored to the user's levels the instant the voice ends.
    expect(channelGain("music")).toBeGreaterThan(0);
    expect(channelGain("soundtrack")).toBeGreaterThan(0);
    expect(getMusicVol()).toBeGreaterThan(0);
  });

  it("stays silent if the user nudges the volume mid-line, then restores", async () => {
    const { acquireVoicePriority } = await import("./audio-bus");
    const { setAudioSettings, channelGain } = await import("./audio-settings");

    setAudioSettings({ muted: false, master: 1, music: 0.6, soundtrack: 0.2 });
    const release = acquireVoicePriority();
    expect(channelGain("music")).toBe(0);

    // User drags the music slider up while the voice is still going.
    setAudioSettings({ music: 0.9 });
    expect(channelGain("music")).toBe(0);

    release();
    expect(channelGain("music")).toBeGreaterThan(0);
  });

  it("holds the duck across overlapping voices (refcount), restoring only at the last release", async () => {
    const { acquireVoicePriority } = await import("./audio-bus");
    const { setAudioSettings, channelGain } = await import("./audio-settings");

    setAudioSettings({ muted: false, master: 1, music: 0.6 });
    const releaseA = acquireVoicePriority();
    const releaseB = acquireVoicePriority();
    expect(channelGain("music")).toBe(0);

    releaseA();
    // A second voice is still speaking — music must remain silent.
    expect(channelGain("music")).toBe(0);

    releaseB();
    expect(channelGain("music")).toBeGreaterThan(0);
  });
});
