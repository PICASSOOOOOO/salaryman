// Shared UI sound helpers — the one place the rest of the app reaches for
// interface sound effects, so "SFX on every aspect of the program" stays
// consistent and is trivial to add to any button/handler. Each call first
// resumes the (autoplay-gated) AudioContext, then fires a procedural SFX from
// soundEngine. Volume/mute are already honored by soundEngine via the central
// audio settings store, so these need no volume args.
import {
  resumeAudioContext,
  sfxUIClick,
  sfxEnter,
  sfxSalarymanSting,
  sfxSave,
  sfxMilestone,
  sfxError,
  sfxStep,
  sfxHologramBeamIn,
  sfxSecretCode,
} from "../soundEngine";

// Per-sound debounce. The global UI-sound listener (lib/global-ui-sound.ts)
// fires a tick on every interactive click; some call sites ALSO call playClick()
// explicitly in their handler. Both fire on the same gesture (~0ms apart), which
// would double the sound. Collapsing repeat calls of the same sound within a
// short window keeps it to a single, clean blip while still allowing genuine
// rapid-fire presses (which are always >45ms apart for a human).
const lastPlayed: Record<string, number> = {};

// Monotonic counter bumped on every sound that actually plays. The global
// UI-sound listener (lib/global-ui-sound.ts) reads this before a gesture and
// re-checks it on a deferred tick: if any explicit handler played a *richer*
// sound (nav / sting / success / …) during the same click dispatch, the epoch
// advances and the global fallback tick is suppressed. This coalesces every
// gesture to a single sound without auditing hundreds of call sites.
let soundEpoch = 0;
export const getSoundEpoch = () => soundEpoch;

function safe(key: string, fn: () => void, minGapMs = 45) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (lastPlayed[key] ?? -Infinity) < minGapMs) return;
  lastPlayed[key] = now;
  soundEpoch++;
  try { resumeAudioContext(); fn(); } catch { /* audio may be unavailable */ }
}

/** Subtle tick — generic button / toggle press. */
export const playClick = () => safe("click", sfxUIClick);
/** Affirmative blip — navigation / entering a section. */
export const playNav = () => safe("nav", sfxEnter);
/** Brand sting — major moments (clock in, launch). */
export const playSting = () => safe("sting", sfxSalarymanSting, 120);
/** Success — save / submit / completion. */
export const playSuccess = () => safe("success", sfxSave, 120);
/** Milestone — a bigger celebratory beat. */
export const playMilestone = () => safe("milestone", sfxMilestone, 120);
/** Error — failed action / validation. */
export const playError = () => safe("error", sfxError, 120);
/** Step — advancing onboarding / wizard steps. */
export const playStep = () => safe("step", sfxStep);
/** Beam-in — a panel / hologram appearing. */
export const playBeamIn = () => safe("beam", sfxHologramBeamIn, 120);
/** Notify — a subtle chime when a new comms toast pops up. Long min-gap so a
 *  coalesced burst of arrivals stays at a single, unobtrusive blip. */
export const playNotify = () => safe("notify", sfxHologramBeamIn, 400);
/** Secret — passcode accepted / hidden unlock. */
export const playSecret = () => safe("secret", sfxSecretCode, 120);
