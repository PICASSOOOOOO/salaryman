// ── Adaptive performance watchdog (auto-detect slow devices) ────────────────
// The city render loop samples its own wall-clock frame rate in ~1s buckets. If
// the rolling average stays low over a sustained window we offer a one-tap
// "RUNNING SLOW?" prompt that flips on the same low-graphics flag the manual
// Settings toggles use. These pure helpers hold the bucket/decision logic and
// the once-only persistence so they can be unit-tested without the canvas, and
// so WorldPlay's loop reads as a thin call into them.

// Frame rate below which a sustained reading is considered "struggling".
export const PERF_FPS_THRESHOLD = 32;
// Buckets of sustained data required before we judge (~5s at 1s/bucket).
export const PERF_MIN_READINGS = 5;
// Rolling window cap — older buckets are dropped past this.
export const PERF_MAX_READINGS = 6;
// A bucket is only complete once at least this much wall-clock has elapsed.
export const PERF_BUCKET_MS = 1000;
// Buckets stretched beyond this were a stall (tab backgrounded, GC, alt-tab),
// not a slow device, so the rolling window is discarded.
export const PERF_STALL_MS = 2000;

export type HeavyPasses = { bloom: boolean; groundGlow: boolean; nightLighting: boolean };

// Whether there is any heavy render pass left to turn off. When all are already
// off there is nothing to reduce, so the prompt must never offer.
export function canReduceHeavyPasses(gq: HeavyPasses): boolean {
  return gq.bloom || gq.groundGlow || gq.nightLighting;
}

// Fold a just-completed FPS bucket into the rolling readings. Returns the new
// readings array (pure — never mutates the input):
//   - bucket not yet complete (winMs < PERF_BUCKET_MS): unchanged
//   - stall bucket (winMs > PERF_STALL_MS): window cleared
//   - otherwise: push (frames * 1000) / winMs, capped to PERF_MAX_READINGS
export function pushFpsBucket(readings: number[], frames: number, winMs: number): number[] {
  if (winMs < PERF_BUCKET_MS) return readings;
  if (winMs > PERF_STALL_MS) return [];
  const next = readings.concat((frames * 1000) / winMs);
  while (next.length > PERF_MAX_READINGS) next.shift();
  return next;
}

// Decide whether to surface the prompt: enough sustained data, the rolling
// average is below threshold, and there is something left to reduce.
export function shouldOfferPerfPrompt(readings: number[], gq: HeavyPasses): boolean {
  if (readings.length < PERF_MIN_READINGS) return false;
  const avgFps = readings.reduce((a, b) => a + b, 0) / readings.length;
  return avgFps < PERF_FPS_THRESHOLD && canReduceHeavyPasses(gq);
}

// ── Once-only persistence ───────────────────────────────────────────────────
// Once the player has accepted OR dismissed the prompt we persist that decision
// so it is never auto-offered again.
export const PERF_PROMPT_KEY = 'sm_perf_prompt_decided';

export function perfPromptDecided(): boolean {
  try { return localStorage.getItem(PERF_PROMPT_KEY) === '1'; } catch { return false; }
}

export function markPerfPromptDecided() {
  try { localStorage.setItem(PERF_PROMPT_KEY, '1'); } catch {}
}

// Dispatched when the player asks Settings to re-check performance. WorldPlay
// listens so a live session can re-surface the prompt without a reload.
export const PERF_PROMPT_RESET_EVENT = 'sm-perf-prompt-reset';

// Clears the persisted decision so the watchdog can offer the prompt again, and
// notifies any live world session to reset its in-memory "already offered" gate.
export function resetPerfPromptDecision() {
  try { localStorage.removeItem(PERF_PROMPT_KEY); } catch {}
  try { window.dispatchEvent(new Event(PERF_PROMPT_RESET_EVENT)); } catch {}
}
