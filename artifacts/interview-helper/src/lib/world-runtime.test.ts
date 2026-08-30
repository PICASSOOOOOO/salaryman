import { describe, expect, it } from 'vitest';
import {
  changedMessageDue,
  movementChanged,
  movementDemanded,
  snapshotChanged,
  stableSnapshot,
  statsChanged,
  visibleDue,
} from './world-runtime';

describe('world runtime snapshots', () => {
  it('treats reordered but equivalent snapshots as unchanged', () => {
    const previous = stableSnapshot({ inventory: [{ id: 'a', qty: 1 }], hp: 90 });
    expect(snapshotChanged({ hp: 90, inventory: [{ qty: 1, id: 'a' }] }, previous).changed).toBe(false);
    expect(snapshotChanged({ hp: 89, inventory: [{ qty: 1, id: 'a' }] }, previous).changed).toBe(true);
  });

  it('detects only material movement and contract fields', () => {
    const old = { x: 10, y: 20, paused: false, interiorBid: undefined };
    expect(movementChanged({ ...old, x: 10.01 }, old)).toBe(false);
    expect(movementChanged({ ...old, x: 10.1 }, old)).toBe(true);
    expect(movementChanged({ ...old, paused: true }, old)).toBe(true);
    expect(movementChanged({ ...old, interiorBid: 'office' }, old)).toBe(true);
    expect(statsChanged({ hp: 100, weaponId: 'bat' }, { hp: 100, weaponId: 'bat' })).toBe(false);
    expect(statsChanged({ hp: 99, weaponId: 'bat' }, { hp: 100, weaponId: 'bat' })).toBe(true);
  });
});

describe('world runtime due rules', () => {
  it('bounds changed sends and never sends unchanged or hidden state', () => {
    expect(changedMessageDue(true, true, 1080, 1000, 80)).toBe(true);
    expect(changedMessageDue(true, true, 1079, 1000, 80)).toBe(false);
    expect(changedMessageDue(false, true, 2000, 1000, 80)).toBe(false);
    expect(changedMessageDue(true, false, 2000, 1000, 80)).toBe(false);
  });

  it('requires meaningful movement demand for probes', () => {
    expect(movementDemanded({ x: 0, y: 0 }, null, 48)).toBe(true);
    expect(movementDemanded({ x: 30, y: 20 }, { x: 0, y: 0 }, 48)).toBe(false);
    expect(movementDemanded({ x: 48, y: 0 }, { x: 0, y: 0 }, 48)).toBe(true);
  });

  it('makes due checks visibility-aware with fake times', () => {
    expect(visibleDue(true, 1000, null, 30_000)).toBe(true);
    expect(visibleDue(false, 100_000, 0, 30_000)).toBe(false);
    expect(visibleDue(true, 29_999, 0, 30_000)).toBe(false);
    expect(visibleDue(true, 30_000, 0, 30_000, false)).toBe(false);
    expect(visibleDue(true, 30_000, 0, 30_000)).toBe(true);
  });
});