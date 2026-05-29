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

function safe(fn: () => void) {
  try { resumeAudioContext(); fn(); } catch { /* audio may be unavailable */ }
}

/** Subtle tick — generic button / toggle press. */
export const playClick = () => safe(sfxUIClick);
/** Affirmative blip — navigation / entering a section. */
export const playNav = () => safe(sfxEnter);
/** Brand sting — major moments (clock in, launch). */
export const playSting = () => safe(sfxSalarymanSting);
/** Success — save / submit / completion. */
export const playSuccess = () => safe(sfxSave);
/** Milestone — a bigger celebratory beat. */
export const playMilestone = () => safe(sfxMilestone);
/** Error — failed action / validation. */
export const playError = () => safe(sfxError);
/** Step — advancing onboarding / wizard steps. */
export const playStep = () => safe(sfxStep);
/** Beam-in — a panel / hologram appearing. */
export const playBeamIn = () => safe(sfxHologramBeamIn);
/** Secret — passcode accepted / hidden unlock. */
export const playSecret = () => safe(sfxSecretCode);
