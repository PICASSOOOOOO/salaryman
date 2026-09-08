// @vitest-environment jsdom
//
// Covers the pure office discovery onboarding state machine — the logic behind
// teaching movement / interaction by DOING and naturally activating the story by
// stepping into the elevator (rather than a "BEGIN STORY" button).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDiscovery,
  saveDiscovery,
  withMoved,
  withInteracted,
  currentDiscoveryStep,
  discoveryCue,
  type DiscoveryState,
  type DiscoveryGate,
} from './office-discovery';

const SLOT = 0;
const fresh = (): DiscoveryState => ({ moved: false, interacted: false });

beforeEach(() => {
  window.localStorage.clear();
});

describe('persistence', () => {
  it('returns a fresh state when nothing is stored', () => {
    expect(loadDiscovery(SLOT)).toEqual({ moved: false, interacted: false });
  });

  it('round-trips saved progress per slot', () => {
    saveDiscovery(1, { moved: true, interacted: false });
    expect(loadDiscovery(1)).toEqual({ moved: true, interacted: false });
    // Different slot stays fresh.
    expect(loadDiscovery(2)).toEqual({ moved: false, interacted: false });
  });

  it('tolerates corrupt storage', () => {
    window.localStorage.setItem('salaryman.office.discovery.0', '{not json');
    expect(loadDiscovery(SLOT)).toEqual({ moved: false, interacted: false });
  });
});

describe('immutability helpers', () => {
  it('withMoved / withInteracted set the flag without mutating', () => {
    const s = fresh();
    const moved = withMoved(s);
    expect(moved).toEqual({ moved: true, interacted: false });
    expect(s.moved).toBe(false);
    const both = withInteracted(moved);
    expect(both).toEqual({ moved: true, interacted: true });
    // No-op when already set returns the same reference.
    expect(withMoved(moved)).toBe(moved);
  });
});

describe('currentDiscoveryStep', () => {
  const eligible: DiscoveryGate = { active: false, eligible: true };
  const ineligible: DiscoveryGate = { active: false, eligible: false };
  const active: DiscoveryGate = { active: true, eligible: true };

  it('shows no step while the gate is still loading', () => {
    expect(currentDiscoveryStep(fresh(), null)).toBeNull();
  });

  it('progresses move → interact → depart for an eligible player', () => {
    expect(currentDiscoveryStep({ moved: false, interacted: false }, eligible)).toBe('move');
    expect(currentDiscoveryStep({ moved: true, interacted: false }, eligible)).toBe('interact');
    expect(currentDiscoveryStep({ moved: true, interacted: true }, eligible)).toBe('depart');
  });

  it('routes a moved+interacted ineligible player to work', () => {
    expect(currentDiscoveryStep({ moved: true, interacted: true }, ineligible)).toBe('work');
  });

  it('teaches the mechanics before gating on eligibility', () => {
    // Even ineligible, a fresh player still learns to move/interact first.
    expect(currentDiscoveryStep({ moved: false, interacted: false }, ineligible)).toBe('move');
    expect(currentDiscoveryStep({ moved: true, interacted: false }, ineligible)).toBe('interact');
  });

  it('reports done once the story is active', () => {
    expect(currentDiscoveryStep({ moved: true, interacted: true }, active)).toBe('done');
    expect(currentDiscoveryStep(fresh(), active)).toBe('done');
  });
});

describe('discoveryCue', () => {
  it('produces no cue for done / null', () => {
    expect(discoveryCue('done', { isTouch: false })).toBeNull();
    expect(discoveryCue(null, { isTouch: false })).toBeNull();
  });

  it('uses touch verbs on touch devices', () => {
    expect(discoveryCue('move', { isTouch: true })!.text).toMatch(/tap/i);
    expect(discoveryCue('move', { isTouch: false })!.text).toMatch(/wasd|arrow/i);
    expect(discoveryCue('interact', { isTouch: true })!.text).toMatch(/tap/i);
    expect(discoveryCue('interact', { isTouch: false })!.text).toMatch(/press e/i);
  });

  it('marks the depart cue as ready and points at the elevator', () => {
    const cue = discoveryCue('depart', { isTouch: false })!;
    expect(cue.tone).toBe('ready');
    expect(cue.text).toMatch(/elevator/i);
    expect(cue.showFindWork).toBe(false);
  });

  it('marks the work cue as blocked with a find-work affordance', () => {
    const cue = discoveryCue('work', { isTouch: false })!;
    expect(cue.tone).toBe('blocked');
    expect(cue.showFindWork).toBe(true);
  });

  it('surfaces the server reason in the work cue when present', () => {
    const cue = discoveryCue('work', { isTouch: false, reason: 'No work visa on file.' })!;
    expect(cue.text).toBe('No work visa on file.');
  });
});
