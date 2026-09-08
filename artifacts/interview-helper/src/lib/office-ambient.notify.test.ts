// @vitest-environment jsdom
//
// Regression guard for the QUIET MEDITATIVE OFFICE AMBIENT bed (soundEngine
// startOfficeAmbient/stopOfficeAmbient). The bed schedules transient swell/chime
// oscillators on timers; the bug this guards against is those voices outliving a
// stop() (ringing on for ~11s) and the self-scheduling loops not halting.
//
// The fake oscillator distinguishes the two WebAudio stop semantics, which is
// what makes this test meaningful:
//   - o.stop()       (no arg) => IMMEDIATE force-stop (what teardown uses).
//   - o.stop(when)   (arg)    => stop SCHEDULED on the audio clock (what each
//                               transient voice sets for itself, ~11s out).
// A transient voice only ends up force-stopped if it was tracked in _officeNodes.
// Without the fix it would merely keep its scheduled (arg) stop, so asserting
// every oscillator was stopped *immediately* after teardown proves the fix.
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
  started = false;
  stopped = false;            // halted by any means
  stoppedImmediately = false; // o.stop() called with NO arg => force-stop
  connect() { return this; }
  start() { this.started = true; }
  stop(when?: number) {
    if (when === undefined) {
      this.stoppedImmediately = true;
      if (!this.stopped) { this.stopped = true; this.onended?.(); }
    } else {
      // Models a WebAudio stop scheduled on the audio clock (currentTime is 0
      // in this fake), driven by the fake timer so advancing time expires it.
      setTimeout(() => {
        if (!this.stopped) { this.stopped = true; this.onended?.(); }
      }, Math.max(0, when * 1000));
    }
  }
  disconnect() {}
}
class FakeBiquadFilter {
  type = "lowpass"; frequency = new FakeAudioParam(); Q = { value: 0 }; gain = new FakeAudioParam();
  connect() { return this; } disconnect() {}
}
let createdOscillators: FakeOscillator[] = [];
class FakeAudioContext {
  state = "running"; currentTime = 0; sampleRate = 44100; destination = {};
  createGain() { return new FakeGainNode(); }
  createOscillator() { const o = new FakeOscillator(); createdOscillators.push(o); return o; }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, loop: false, onended: null, connect() { return this; }, start() {}, stop() {}, disconnect() {} }; }
  createBiquadFilter() { return new FakeBiquadFilter(); }
  resume() {}
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  createdOscillators = [];
  window.localStorage.clear();
  (globalThis as any).AudioContext = FakeAudioContext as any;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("office ambient lifecycle", () => {
  it("stop force-stops every outstanding voice (not just the drone) and halts scheduling", async () => {
    const eng = await import("../soundEngine");
    eng.startOfficeAmbient();
    expect(eng.isOfficeAmbientRunning()).toBe(true);

    // Advance < the ~11s swell life so the in-flight voices have NOT self-expired
    // and NONE has been force-stopped yet.
    vi.advanceTimersByTime(5_000);
    const inFlight = createdOscillators.filter((o) => !o.stopped);
    expect(inFlight.length).toBeGreaterThan(0);
    expect(createdOscillators.some((o) => o.stoppedImmediately)).toBe(false);

    eng.stopOfficeAmbient();
    expect(eng.isOfficeAmbientRunning()).toBe(false);

    // Run the teardown timer; every voice must now be force-stopped immediately,
    // which only happens if it was tracked in _officeNodes (the fix).
    vi.advanceTimersByTime(1_000);
    for (const o of createdOscillators) expect(o.stoppedImmediately).toBe(true);

    // After stop, advancing time creates NO new voices (loops cleared).
    const countAfterStop = createdOscillators.length;
    vi.advanceTimersByTime(60_000);
    expect(createdOscillators.length).toBe(countAfterStop);
  });

  it("does not accumulate transient voices over a long uninterrupted run", async () => {
    const eng = await import("../soundEngine");
    eng.startOfficeAmbient();

    vi.advanceTimersByTime(120_000);

    // Lots of voices were created and the bulk have self-expired on schedule...
    expect(createdOscillators.length).toBeGreaterThan(20);
    expect(createdOscillators.filter((o) => o.stopped).length).toBeGreaterThan(0);
    // ...so the live (un-expired) set stays bounded — no unbounded growth.
    // (The 4 persistent drone voices never schedule a stop and are expected here.)
    expect(createdOscillators.filter((o) => !o.stopped).length).toBeLessThan(20);

    eng.stopOfficeAmbient();
    vi.advanceTimersByTime(1_000);
  });

  it("is idempotent: a second start does not spin up a second voice set", async () => {
    const eng = await import("../soundEngine");
    eng.startOfficeAmbient();
    const afterFirst = createdOscillators.length;
    eng.startOfficeAmbient(); // guarded by the running flag
    expect(createdOscillators.length).toBe(afterFirst);
    eng.stopOfficeAmbient();
    vi.advanceTimersByTime(1_000);
  });
});
