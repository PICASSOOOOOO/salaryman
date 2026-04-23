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
