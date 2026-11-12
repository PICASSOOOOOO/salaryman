/**
 * Office discovery onboarding — teach the game's core mechanics by DOING, not by
 * front-loading a wall of instructions.
 *
 * Instead of a static "WASD / E / C" hint bar and a pre-game tutorial modal, the
 * office surfaces ONE contextual in-world cue at a time that nudges the player to
 * perform the next mechanic for themselves:
 *
 *   move      → learn to walk (first movement clears it)
 *   interact  → learn to use an object (first interaction clears it)
 *   depart    → eligible: head to the ELEVATOR; using it BEGINS the story
 *   work      → not eligible: land a job / register a business first
 *   done      → story already begun (no cue)
 *
 * The story is no longer started by a "BEGIN STORY" button — completing the
 * discovery sequence and stepping into the elevator is what naturally activates
 * it. This module is the pure, testable state machine behind that flow; the
 * office page owns the side effects (movement/interaction detection, navigation).
 */

/** Per-slot persisted progress through the discovery onboarding. */
export interface DiscoveryState {
  /** The player has moved at least once. */
  moved: boolean;
  /** The player has used at least one object (station / terminal / elevator). */
  interacted: boolean;
}

/** The single mechanic the player is currently being nudged toward. */
export type DiscoveryStep = 'move' | 'interact' | 'depart' | 'work' | 'done';

/** Server-authoritative story snapshot the step machine needs. `null` = unknown
 *  (still loading) → no cue is shown so a transient gap never flashes a hint. */
export interface DiscoveryGate {
  active: boolean;
  eligible: boolean;
  reason?: string;
}

/** Tone drives the cue's colour/emphasis in the office UI. */
export type DiscoveryTone = 'cue' | 'ready' | 'blocked';

export interface DiscoveryCue {
  step: DiscoveryStep;
  text: string;
  tone: DiscoveryTone;
  /** True when the cue should offer a FIND WORK affordance. */
  showFindWork: boolean;
}

const FRESH: DiscoveryState = { moved: false, interacted: false };

function keyFor(slot: number): string {
  return `salaryman.office.discovery.${slot}`;
}

/** Best-effort read of the persisted discovery progress for a slot. */
export function loadDiscovery(slot: number): DiscoveryState {
  if (typeof window === 'undefined') return { ...FRESH };
  try {
    const raw = window.localStorage.getItem(keyFor(slot));
    if (!raw) return { ...FRESH };
    const parsed = JSON.parse(raw) as Partial<DiscoveryState>;
    return { moved: !!parsed.moved, interacted: !!parsed.interacted };
  } catch {
    return { ...FRESH };
  }
}

/** Persist discovery progress for a slot (best-effort). */
export function saveDiscovery(slot: number, state: DiscoveryState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(slot), JSON.stringify(state));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Returns a new state with `moved` set (no-op if already set). */
export function withMoved(state: DiscoveryState): DiscoveryState {
  return state.moved ? state : { ...state, moved: true };
}

/** Returns a new state with `interacted` set (no-op if already set). */
export function withInteracted(state: DiscoveryState): DiscoveryState {
  return state.interacted ? state : { ...state, interacted: true };
}

/**
 * The mechanic to nudge next, given local progress and the server story gate.
 * Returns `null` while the gate is still loading (no cue shown).
 */
export function currentDiscoveryStep(
  state: DiscoveryState,
  gate: DiscoveryGate | null,
): DiscoveryStep | null {
  if (!gate) return null;
  if (gate.active) return 'done';
  if (!state.moved) return 'move';
  if (!state.interacted) return 'interact';
  return gate.eligible ? 'depart' : 'work';
}

/**
 * The contextual cue copy for a step. `done`/`null` produce no cue. Touch and
 * pointer/keyboard players get device-appropriate verbs.
 */
export function discoveryCue(
  step: DiscoveryStep | null,
  opts: { isTouch: boolean; reason?: string },
): DiscoveryCue | null {
  if (!step || step === 'done') return null;
  const { isTouch } = opts;
  switch (step) {
    case 'move':
      return {
        step,
        tone: 'cue',
        showFindWork: false,
        text: isTouch
          ? 'Tap the floor to move around your office.'
          : 'Use WASD or the arrow keys to move around your office.',
      };
    case 'interact':
      return {
        step,
        tone: 'cue',
        showFindWork: false,
        text: isTouch
          ? 'Walk up to something — your desk, the ATM, the payphone — and tap it to use it.'
          : 'Walk up to something and press E to use it.',
      };
    case 'depart':
      return {
        step,
        tone: 'ready',
        showFindWork: false,
        text: isTouch
          ? "You're ready. Step into the ELEVATOR to head out into the city."
          : "You're ready. Take the ELEVATOR (walk up · press E) to head out into the city.",
      };
    case 'work':
      return {
        step,
        tone: 'blocked',
        showFindWork: true,
        text: opts.reason || 'Land a job or register a business — then the elevator will take you out.',
      };
  }
}
