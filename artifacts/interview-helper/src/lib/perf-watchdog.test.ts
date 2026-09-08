import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushFpsBucket,
  shouldOfferPerfPrompt,
  canReduceHeavyPasses,
  perfPromptDecided,
  markPerfPromptDecided,
  PERF_PROMPT_KEY,
  PERF_FPS_THRESHOLD,
  PERF_MIN_READINGS,
  PERF_MAX_READINGS,
  type HeavyPasses,
} from './perf-watchdog';

const allOn: HeavyPasses = { bloom: true, groundGlow: true, nightLighting: true };
const allOff: HeavyPasses = { bloom: false, groundGlow: false, nightLighting: false };

// Build a rolling window of `count` buckets each measuring `fps` frames/sec by
// feeding complete ~1s buckets through pushFpsBucket, exactly as the loop does.
function windowOf(fps: number, count: number): number[] {
  let readings: number[] = [];
  for (let i = 0; i < count; i++) readings = pushFpsBucket(readings, fps, 1000);
  return readings;
}

describe('pushFpsBucket', () => {
  it('is pure — never mutates the input array', () => {
    const before = [60, 60];
    const after = pushFpsBucket(before, 60, 1000);
    expect(before).toEqual([60, 60]);
    expect(after).not.toBe(before);
  });

  it('ignores buckets that have not completed (< 1000ms)', () => {
    const readings = [55];
    expect(pushFpsBucket(readings, 30, 999)).toBe(readings);
  });

  it('records a completed bucket as frames-per-second', () => {
    // 30 frames over a 1000ms window = 30fps.
    expect(pushFpsBucket([], 30, 1000)).toEqual([30]);
    // 25 frames over a 1250ms window = 20fps.
    expect(pushFpsBucket([], 25, 1250)).toEqual([20]);
  });

  it('discards the whole window when a bucket was stretched by a stall', () => {
    const built = windowOf(20, 4);
    expect(built).toHaveLength(4);
    // A bucket longer than the stall threshold (tab backgrounded, GC) clears it.
    expect(pushFpsBucket(built, 5, 5000)).toEqual([]);
  });

  it('caps the rolling window length, dropping the oldest reading', () => {
    let readings: number[] = [];
    for (let i = 0; i < PERF_MAX_READINGS + 3; i++) {
      readings = pushFpsBucket(readings, 10 + i, 1000);
    }
    expect(readings).toHaveLength(PERF_MAX_READINGS);
    // The earliest (10, 11, 12 fps) buckets fell off the front.
    expect(readings[0]).toBe(10 + 3);
  });
});

describe('canReduceHeavyPasses', () => {
  it('is true while any heavy pass is still on', () => {
    expect(canReduceHeavyPasses(allOn)).toBe(true);
    expect(canReduceHeavyPasses({ bloom: false, groundGlow: false, nightLighting: true })).toBe(true);
  });

  it('is false once every heavy pass is already off', () => {
    expect(canReduceHeavyPasses(allOff)).toBe(false);
  });
});

describe('shouldOfferPerfPrompt', () => {
  it('does not trigger before enough sustained data', () => {
    const readings = windowOf(10, PERF_MIN_READINGS - 1);
    expect(shouldOfferPerfPrompt(readings, allOn)).toBe(false);
  });

  it('triggers when a sustained low average meets the threshold', () => {
    const readings = windowOf(20, PERF_MIN_READINGS);
    expect(readings.length).toBeGreaterThanOrEqual(PERF_MIN_READINGS);
    expect(shouldOfferPerfPrompt(readings, allOn)).toBe(true);
  });

  it('does not trigger when the average is at or above the threshold', () => {
    const readings = windowOf(PERF_FPS_THRESHOLD, PERF_MIN_READINGS);
    expect(shouldOfferPerfPrompt(readings, allOn)).toBe(false);
    const healthy = windowOf(60, PERF_MIN_READINGS);
    expect(shouldOfferPerfPrompt(healthy, allOn)).toBe(false);
  });

  it('does not trigger when the heavy passes are already off (nothing to reduce)', () => {
    const readings = windowOf(15, PERF_MIN_READINGS);
    expect(shouldOfferPerfPrompt(readings, allOff)).toBe(false);
  });

  it('does not trigger when stall buckets keep resetting the window', () => {
    let readings: number[] = [];
    // Alternate slow buckets with stalls; the window never reaches the minimum.
    for (let i = 0; i < 10; i++) {
      readings = pushFpsBucket(readings, 15, 1000);
      readings = pushFpsBucket(readings, 1, 6000);
    }
    expect(readings).toEqual([]);
    expect(shouldOfferPerfPrompt(readings, allOn)).toBe(false);
  });
});

describe('once-only persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips: undecided until marked, decided after', () => {
    expect(perfPromptDecided()).toBe(false);
    markPerfPromptDecided();
    expect(perfPromptDecided()).toBe(true);
    expect(localStorage.getItem(PERF_PROMPT_KEY)).toBe('1');
  });

  it('stays decided across reads so the prompt never re-shows', () => {
    markPerfPromptDecided();
    // Accept and Dismiss both call markPerfPromptDecided; either way it sticks.
    markPerfPromptDecided();
    expect(perfPromptDecided()).toBe(true);
  });
});
