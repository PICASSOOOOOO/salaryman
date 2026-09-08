// Tiny global "phone is busy" bus. The phone system holds multiple sources of
// busyness (an incoming Twilio ring, an active conference, an outbound call in
// progress). Each source registers itself by name; the music player listens
// and pauses any audio whenever ANY source is busy.
//
// Phone takes precedence over the media player.

type Listener = (busy: boolean) => void;

const reasons = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  const busy = reasons.size > 0;
  for (const l of listeners) {
    try { l(busy); } catch {}
  }
}

export function setPhoneBusy(reason: string, busy: boolean) {
  const had = reasons.has(reason);
  if (busy && !had) {
    reasons.add(reason);
    emit();
  } else if (!busy && had) {
    reasons.delete(reason);
    emit();
  }
}

export function isPhoneBusy(): boolean {
  return reasons.size > 0;
}

export function subscribePhoneBusy(cb: Listener): () => void {
  listeners.add(cb);
  // Fire immediately so subscribers get current state.
  try { cb(reasons.size > 0); } catch {}
  return () => { listeners.delete(cb); };
}
