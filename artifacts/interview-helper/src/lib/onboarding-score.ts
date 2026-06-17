import { startOfficeAmbient, isOfficeAmbientRunning, resumeAudioContext } from "@/soundEngine";
import { whenAudioUnlocked } from "@/lib/tts";

// ── Onboarding score ─────────────────────────────────────────────────────────
// One subtle, continuous background bed that plays across the WHOLE onboarding
// flow: the Pablo intro cinematic (/pablo) → immigration intake/stamping
// (/immigration) → the post-onboarding office intro, then the in-game audio
// takes over once the player reaches the office.
//
// It reuses the OFFICE AMBIENT bed — a module-level singleton in soundEngine
// (`_officeRunning` guard) that survives route changes and gates its loudness
// through the shared `_musicVol` path. That means it already respects the master
// volume, the AMBIANCE on/off toggle, master mute, AND voice-priority ducking
// (so it sits politely under Pablo's TTS) with no extra wiring here.
//
// Because the bed is a singleton, calling this from several onboarding screens
// is safe: whichever screen mounts first starts it, every later call is a no-op,
// so the score never restarts or double-plays as the player moves between
// screens. Stopping is owned by PostOnboardingIntro (on finish/unmount) and the
// office page, so onboarding screens only ever START it — never stop it — which
// is what keeps it seamless across the /pablo → /immigration route change.
//
// Playback is deferred until audio is unlocked (the AudioContext needs a user
// gesture), so on a cold load the score begins the instant the player first
// interacts. Returns a cancel fn to drop the pending unlock wait on unmount.
export function ensureOnboardingScore(): () => void {
  return whenAudioUnlocked(() => {
    try {
      resumeAudioContext();
      if (!isOfficeAmbientRunning()) startOfficeAmbient();
    } catch {
      /* audio is best-effort — never block onboarding on it */
    }
  });
}
