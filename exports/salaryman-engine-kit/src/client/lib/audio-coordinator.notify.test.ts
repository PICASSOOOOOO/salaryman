// @vitest-environment jsdom
//
// Verifies the BACKGROUND-MUSIC-TIER coordinator: at most ONE sustained
// background tier (procedural world score, office ambient bed, radio OST, the
// headless office radio, or the Hummingbird global player) may be audible at a
// time. Starting any tier claims ownership and stops every OTHER registered
// tier (last-writer-wins, no auto-resume). Crowd murmur and one-shot SFX never
// participate.
//
// Exercises the real chain: audio-bus (coordinator) + soundEngine (the two
// engine tiers, world score + office ambient, register at module load). Modules
// are reset between tests so the bus / engine start clean. Fake timers keep the
// office bed's self-scheduling swell/chime voices and the score's intervals
// under control.
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
  vi.useFakeTimers();
  window.localStorage.clear();
  (globalThis as any).AudioContext = FakeAudioContext as any;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("background-tier coordinator (audio-bus)", () => {
  it("claim transfers ownership and stops every OTHER tier, not the claimer", async () => {
    const bus = await import("./audio-bus");
    let aStops = 0, bStops = 0;
    bus.registerBackgroundAudio("a", () => { aStops++; });
    bus.registerBackgroundAudio("b", () => { bStops++; });

    bus.claimBackgroundAudio("a");
    expect(bus.getBackgroundAudioOwner()).toBe("a");
    // The claimer is NOT stopped; the other tier is.
    expect(aStops).toBe(0);
    expect(bStops).toBe(1);

    bus.claimBackgroundAudio("b");
    expect(bus.getBackgroundAudioOwner()).toBe("b");
    expect(aStops).toBe(1); // a now stopped by b's claim
    expect(bStops).toBe(1); // b (the claimer) untouched
  });

  it("release only clears ownership when the caller still holds it (stale release is a no-op)", async () => {
    const bus = await import("./audio-bus");
    bus.registerBackgroundAudio("a", () => {});
    bus.registerBackgroundAudio("b", () => {});

    bus.claimBackgroundAudio("a");
    bus.claimBackgroundAudio("b"); // ownership moved to b
    // a lost the claim earlier; its late release must NOT clobber b's ownership.
    bus.releaseBackgroundAudio("a");
    expect(bus.getBackgroundAudioOwner()).toBe("b");

    bus.releaseBackgroundAudio("b");
    expect(bus.getBackgroundAudioOwner()).toBeNull();
  });

  it("stopBackgroundAudioExcept stops all but an optional keeper", async () => {
    const bus = await import("./audio-bus");
    let aStops = 0, bStops = 0;
    bus.registerBackgroundAudio("a", () => { aStops++; });
    bus.registerBackgroundAudio("b", () => { bStops++; });
    bus.claimBackgroundAudio("a"); // b stopped once

    bus.stopBackgroundAudioExcept("a"); // keep a, stop b
    expect(aStops).toBe(0);
    expect(bus.getBackgroundAudioOwner()).toBe("a");

    bus.stopBackgroundAudioExcept(); // no keeper — stop everything
    expect(aStops).toBe(1);
    expect(bus.getBackgroundAudioOwner()).toBeNull();
  });

  it("unregister removes the stopper so it is no longer called on a claim", async () => {
    const bus = await import("./audio-bus");
    let aStops = 0;
    const unregister = bus.registerBackgroundAudio("a", () => { aStops++; });
    bus.registerBackgroundAudio("b", () => {});

    unregister();
    bus.claimBackgroundAudio("b");
    expect(aStops).toBe(0); // a's stopper was removed
  });
});

describe("engine tiers are mutually exclusive via the coordinator", () => {
  it("starting the office bed pauses a previously-playing external tier (e.g. radio / Hummingbird)", async () => {
    const bus = await import("./audio-bus");
    const eng = await import("../soundEngine");

    let probeStops = 0;
    bus.registerBackgroundAudio("probe", () => { probeStops++; });
    bus.claimBackgroundAudio("probe");
    expect(bus.getBackgroundAudioOwner()).toBe("probe");

    eng.startOfficeAmbient();
    expect(eng.isOfficeAmbientRunning()).toBe(true);
    expect(bus.getBackgroundAudioOwner()).toBe(bus.BG_OWNERS.officeAmbient);
    expect(probeStops).toBe(1); // the external tier was paused by the office claim

    eng.stopOfficeAmbient();
    vi.advanceTimersByTime(2_000);
  });

  it("world score and office bed cannot both own the tier — last writer wins, prior one stops", async () => {
    const bus = await import("./audio-bus");
    const eng = await import("../soundEngine");

    eng.startOfficeAmbient();
    expect(eng.isOfficeAmbientRunning()).toBe(true);
    expect(bus.getBackgroundAudioOwner()).toBe(bus.BG_OWNERS.officeAmbient);

    // World score starts → claims ownership → office bed is stopped.
    eng.playMusic();
    expect(bus.getBackgroundAudioOwner()).toBe(bus.BG_OWNERS.worldScore);
    expect(eng.isOfficeAmbientRunning()).toBe(false);

    // Office bed restarts → reclaims ownership back from the world score.
    eng.startOfficeAmbient();
    expect(bus.getBackgroundAudioOwner()).toBe(bus.BG_OWNERS.officeAmbient);
    expect(eng.isOfficeAmbientRunning()).toBe(true);

    eng.stopOfficeAmbient();
    vi.advanceTimersByTime(2_000);
  });

  it("stopAllBackgroundAudio halts the engine tiers AND releases ownership", async () => {
    const bus = await import("./audio-bus");
    const eng = await import("../soundEngine");

    eng.startOfficeAmbient();
    expect(bus.getBackgroundAudioOwner()).toBe(bus.BG_OWNERS.officeAmbient);

    eng.stopAllBackgroundAudio();
    expect(eng.isOfficeAmbientRunning()).toBe(false);
    expect(bus.getBackgroundAudioOwner()).toBeNull();

    vi.advanceTimersByTime(2_000);
  });
});
