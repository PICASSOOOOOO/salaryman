// @vitest-environment jsdom
//
// Verifies the new-message chime is truly SILENT when the user has muted audio
// (or pulled the SFX channel to zero) via the central audio-settings store.
//
// This exercises the real chain end-to-end: audio-settings -> soundEngine ->
// playNotify(). A stubbed Web Audio API records the peak gain of every node the
// chime creates so we can prove the output is zero when muted, and non-zero when
// it isn't. soundEngine is NOT mocked here — that's the point. Modules are reset
// between tests so soundEngine state (volume, mute, debounce) starts clean.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Peak gain values applied to any GainNode the chime builds. We snapshot only
// the gains created during playNotify() (see beforeChime()) so unrelated ambient
// setup from the mute toggle never pollutes the measurement.
let gainPeaks: number[] = [];
let recording = false;

class FakeAudioParam {
  private _value = 0;
  // Only GainNode.gain params count toward "loudness" — oscillator frequency /
  // detune and filter params also flow through here but must NOT be recorded.
  constructor(private readonly record: boolean = false) {}
  get value() {
    return this._value;
  }
  set value(v: number) {
    this._value = v;
    if (this.record && recording) gainPeaks.push(v);
  }
  setValueAtTime(v: number) {
    this._value = v;
    if (this.record && recording) gainPeaks.push(v);
    return this;
  }
  // Non-"loudness" scheduling — intentionally not recorded.
  exponentialRampToValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  cancelAndHoldAtTime() {
    return this;
  }
}

class FakeGainNode {
  gain = new FakeAudioParam(true); // the only param that counts as loudness
  connect() {
    return this;
  }
  disconnect() {}
}

class FakeOscillator {
  type = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}

class FakeBufferSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}

class FakeBiquadFilter {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = { value: 0 };
  gain = new FakeAudioParam();
  connect() {
    return this;
  }
  disconnect() {}
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createGain() {
    return new FakeGainNode();
  }
  createOscillator() {
    return new FakeOscillator();
  }
  createBuffer(_ch: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
  createBufferSource() {
    return new FakeBufferSource();
  }
  createBiquadFilter() {
    return new FakeBiquadFilter();
  }
  resume() {}
}

let nowMs = 0;

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  gainPeaks = [];
  recording = false;
  nowMs = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  (globalThis as any).AudioContext = FakeAudioContext as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Record only the gains produced by the chime itself.
function withChimeRecording(fn: () => void) {
  gainPeaks = [];
  recording = true;
  try {
    fn();
  } finally {
    recording = false;
  }
}

describe("new-message chime respects mute / volume", () => {
  it("produces no audible output when audio is muted", async () => {
    const { setAudioSettings } = await import("./audio-settings");
    const { getSfxVol } = await import("../soundEngine");
    const { playNotify } = await import("./ui-sound");

    setAudioSettings({ muted: true });
    expect(getSfxVol()).toBe(0);

    withChimeRecording(() => playNotify());

    // The chime function still ran, but every gain it set is silent.
    expect(gainPeaks.length).toBeGreaterThan(0);
    expect(Math.max(...gainPeaks)).toBe(0);
  });

  it("produces no audible output when the SFX channel is at zero", async () => {
    const { setAudioSettings } = await import("./audio-settings");
    const { getSfxVol } = await import("../soundEngine");
    const { playNotify } = await import("./ui-sound");

    setAudioSettings({ muted: false, sfx: 0, master: 0.8 });
    expect(getSfxVol()).toBe(0);

    withChimeRecording(() => playNotify());

    expect(gainPeaks.length).toBeGreaterThan(0);
    expect(Math.max(...gainPeaks)).toBe(0);
  });

  it("is audible when unmuted with a non-zero SFX volume (positive control)", async () => {
    const { setAudioSettings } = await import("./audio-settings");
    const { getSfxVol } = await import("../soundEngine");
    const { playNotify } = await import("./ui-sound");

    setAudioSettings({ muted: false, sfx: 0.9, master: 0.8 });
    expect(getSfxVol()).toBeGreaterThan(0);

    withChimeRecording(() => playNotify());

    expect(gainPeaks.length).toBeGreaterThan(0);
    expect(Math.max(...gainPeaks)).toBeGreaterThan(0);
  });
});
