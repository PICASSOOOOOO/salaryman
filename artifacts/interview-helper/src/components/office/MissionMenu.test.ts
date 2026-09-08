// @vitest-environment jsdom
//
// Covers the pure scene-playability rule behind the office MISSION MENU: which
// scenes can be launched from the office, and when launching the reserved opener
// begins the story run.
import { describe, it, expect } from 'vitest';
import { isScenePlayable } from './MissionMenu';
import type { StoryAssignmentDef } from '@/lib/story-assignments';

const opener: StoryAssignmentDef = { id: 'and_it_all_falls_down', no: 1, title: 'OPENER', objective: '...', reserved: true };
const later: StoryAssignmentDef = { id: 'q1_cold_start', no: 2, title: 'LATER', objective: '...' };

describe('isScenePlayable', () => {
  it('never playable when it is not the active scene', () => {
    expect(isScenePlayable(opener, false, false)).toBe(false);
    expect(isScenePlayable(opener, false, true)).toBe(false);
    expect(isScenePlayable(later, false, true)).toBe(false);
  });

  it('the reserved opener is playable pre-story (it begins the run)', () => {
    expect(isScenePlayable(opener, true, false)).toBe(true);
  });

  it('a non-reserved scene is NOT playable until the story is running', () => {
    expect(isScenePlayable(later, true, false)).toBe(false);
  });

  it('any active scene is playable once the story is running', () => {
    expect(isScenePlayable(opener, true, true)).toBe(true);
    expect(isScenePlayable(later, true, true)).toBe(true);
  });
});
