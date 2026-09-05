// Tests for readBoCollectorsFromSave (lib/world-map-collectors.ts)
//
// The game loop writes sm_live every ~1s and clears it on teardown. The world
// map should show real-time collector positions while the game is running, and
// fall back to the persistent sm_save snapshot (or empty) once the game loop
// exits. These tests guard against regressions that would leave phantom
// collector dots on the map after the player leaves the city.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readBoCollectorsFromSave } from './world-map-collectors';

const PIN_A = { x: 100, y: 200 };
const PIN_B = { x: 300, y: 400 };

function setLive(payload: object) {
  localStorage.setItem('sm_live', JSON.stringify(payload));
}

function setSave(payload: object) {
  localStorage.setItem('sm_save', JSON.stringify(payload));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('readBoCollectorsFromSave — live path (sm_live recent)', () => {
  it('returns collectors from sm_live when writtenAt is fresh', () => {
    setLive({ writtenAt: Date.now(), boCollectors: [PIN_A, PIN_B], wantedLevel: 2 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_A, PIN_B]);
    expect(result.wantedLevel).toBe(2);
  });

  it('prefers sm_live over sm_save when both are present and sm_live is fresh', () => {
    setLive({ writtenAt: Date.now(), boCollectors: [PIN_A], wantedLevel: 1 });
    setSave({ boCollectors: [PIN_B], wantedLevel: 3, bountyAmount: 500, boWaveCount: 2 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_A]);
    expect(result.wantedLevel).toBe(1);
  });

  it('returns empty collectors array when sm_live is fresh but boCollectors is missing', () => {
    setLive({ writtenAt: Date.now(), wantedLevel: 1 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(1);
  });
});

describe('readBoCollectorsFromSave — stale sm_live falls back to sm_save', () => {
  it('falls back to sm_save when sm_live writtenAt is older than 5 minutes', () => {
    const staleTime = Date.now() - 6 * 60 * 1000;
    setLive({ writtenAt: staleTime, boCollectors: [PIN_A], wantedLevel: 5 });
    setSave({ boCollectors: [PIN_B], wantedLevel: 1, bountyAmount: 250, boWaveCount: 1 });

    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_B]);
    expect(result.wantedLevel).toBe(1);
    expect(result.bountyAmount).toBe(250);
    expect(result.boWaveCount).toBe(1);
  });

  it('falls back to sm_save when sm_live has no writtenAt (treated as Infinity age)', () => {
    setLive({ boCollectors: [PIN_A], wantedLevel: 5 });
    setSave({ boCollectors: [PIN_B], wantedLevel: 2, bountyAmount: 100, boWaveCount: 3 });

    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_B]);
    expect(result.wantedLevel).toBe(2);
  });

  it('returns empty when sm_live is stale and sm_save is absent', () => {
    const staleTime = Date.now() - 10 * 60 * 1000;
    setLive({ writtenAt: staleTime, boCollectors: [PIN_A], wantedLevel: 3 });

    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(0);
    expect(result.bountyAmount).toBe(0);
    expect(result.boWaveCount).toBe(0);
  });
});

describe('readBoCollectorsFromSave — sm_live absent (post-game-loop-teardown)', () => {
  it('returns sm_save data when sm_live is absent', () => {
    setSave({ boCollectors: [PIN_A, PIN_B], wantedLevel: 2, bountyAmount: 750, boWaveCount: 4 });

    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_A, PIN_B]);
    expect(result.wantedLevel).toBe(2);
    expect(result.bountyAmount).toBe(750);
    expect(result.boWaveCount).toBe(4);
  });

  it('returns all-zero defaults when both sm_live and sm_save are absent', () => {
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(0);
    expect(result.bountyAmount).toBe(0);
    expect(result.boWaveCount).toBe(0);
  });

  it('returns defaults when sm_save has no boCollectors field', () => {
    setSave({ wantedLevel: 1, bountyAmount: 0, boWaveCount: 0 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(1);
  });
});

describe('readBoCollectorsFromSave — robustness', () => {
  it('returns empty defaults when sm_live is corrupt JSON (catch fires, sm_save not reached)', () => {
    // The try/catch wraps the whole function body, so a JSON parse error on
    // sm_live short-circuits to the catch and returns EMPTY — sm_save is never
    // read. This is acceptable: corrupt sm_live means an unknown state.
    localStorage.setItem('sm_live', '{ not valid json !!');
    setSave({ boCollectors: [PIN_A], wantedLevel: 1, bountyAmount: 50, boWaveCount: 1 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(0);
  });

  it('returns empty defaults when both sm_live and sm_save are corrupt JSON', () => {
    localStorage.setItem('sm_live', 'bad');
    localStorage.setItem('sm_save', 'also bad');
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
    expect(result.wantedLevel).toBe(0);
  });

  it('treats non-array boCollectors in sm_save as empty', () => {
    setSave({ boCollectors: 'not-an-array', wantedLevel: 1, bountyAmount: 0, boWaveCount: 0 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([]);
  });

  it('exactly at the 5-minute boundary is treated as fresh (age < 5min check)', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    setLive({ writtenAt: now - (5 * 60 * 1000 - 1), boCollectors: [PIN_A], wantedLevel: 1 });
    setSave({ boCollectors: [PIN_B], wantedLevel: 3, bountyAmount: 0, boWaveCount: 0 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_A]);
  });

  it('exactly at 5 minutes is treated as stale (age >= 5min)', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    setLive({ writtenAt: now - 5 * 60 * 1000, boCollectors: [PIN_A], wantedLevel: 1 });
    setSave({ boCollectors: [PIN_B], wantedLevel: 3, bountyAmount: 0, boWaveCount: 0 });
    const result = readBoCollectorsFromSave();
    expect(result.collectors).toEqual([PIN_B]);
  });
});
