/**
 * Tiny pub-sub used to enforce a global "voice priority" rule:
 * whenever Pablo / NPC TTS is speaking (or the phone is ringing/active),
 * background music ducks itself. This is a major UX pain-point — TTS
 * frequently fails silently when music drowns it out, so the rule is
 * always-on: voice wins.
 *
 * Anyone can call setVoicePriority(true) on speech start and (false) on
 * end / cancel. Listeners (currently MusicPlayerContext) react by pausing
 * playback. Multiple concurrent voice sources increment a refcount so the
 * music doesn't resume mid-line when one finishes before another.
 */

type Listener = (active: boolean) => void;

let voiceCount = 0;
const listeners = new Set<Listener>();

function notify() {
  const active = voiceCount > 0;
  for (const fn of listeners) {
    try { fn(active); } catch { /* swallow */ }
  }
}

export function acquireVoicePriority(): () => void {
  voiceCount += 1;
  if (voiceCount === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    voiceCount = Math.max(0, voiceCount - 1);
    if (voiceCount === 0) notify();
  };
}

export function isVoicePriorityActive(): boolean { return voiceCount > 0; }

export function subscribeVoicePriority(fn: Listener): () => void {
  listeners.add(fn);
  // Sync the new subscriber to current state immediately.
  try { fn(voiceCount > 0); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}

// ── Background-music-tier coordinator ────────────────────────────────────────
// On top of voice ducking, the app enforces a second rule: at most ONE sustained
// "background music tier" source may be audible at a time. The tiers are the
// procedural world score, the office ambient bed, Shadow Radio, and the
// Hummingbird global player. (Crowd murmur is a
// deliberate SFX-channel sub-layer of the world score and is NOT a tier, so it
// does not participate here.) One-shot SFX never participate either.
//
// Each tier registers a stop callback under a stable owner id. When a tier
// starts playing it calls claimBackgroundAudio(owner): ownership transfers to it
// and EVERY OTHER registered tier is stopped/paused. The previously-owning tier
// does not auto-resume on the next handoff — cross-tier handoff is user/page
// driven, mirroring the existing phone/voice "no auto-resume" UX. Voice ducking
// (above) still layers on top: a speaking voice ducks whichever tier is active.

export const BG_OWNERS = {
  worldScore: "world-score",
  officeAmbient: "office-ambient",
  radioPablo: "radio-pablo",
  hummingbird: "hummingbird",
} as const;

type BgStop = () => void;
const bgStoppers = new Map<string, BgStop>();
let bgOwner: string | null = null;

// Register a tier's stop callback. Returns an unregister fn. Re-registering the
// same owner replaces its stopper (idempotent for module-singleton sources).
export function registerBackgroundAudio(owner: string, stop: BgStop): () => void {
  bgStoppers.set(owner, stop);
  return () => { if (bgStoppers.get(owner) === stop) bgStoppers.delete(owner); };
}

// A tier announces it is now playing. Ownership is set FIRST (so a stopper that
// re-entrantly calls releaseBackgroundAudio for its own id can't clobber the new
// owner), then every OTHER registered tier is stopped.
export function claimBackgroundAudio(owner: string): void {
  bgOwner = owner;
  for (const [id, stop] of bgStoppers) {
    if (id === owner) continue;
    try { stop(); } catch { /* swallow */ }
  }
}

// A tier announces it has stopped. Only clears ownership if it still holds it
// (so a stale release from a tier that already lost the claim is a no-op).
export function releaseBackgroundAudio(owner: string): void {
  if (bgOwner === owner) bgOwner = null;
}

export function getBackgroundAudioOwner(): string | null { return bgOwner; }

// Route-change backstop helper: stop every registered tier except an optional
// keeper (the tier the destination route legitimately owns). Used by the App
// router listener so a page that forgot to clean up cannot leak audio forward.
export function stopBackgroundAudioExcept(keep?: string): void {
  for (const [id, stop] of bgStoppers) {
    if (keep && id === keep) continue;
    try { stop(); } catch { /* swallow */ }
  }
  bgOwner = keep ?? null;
}
