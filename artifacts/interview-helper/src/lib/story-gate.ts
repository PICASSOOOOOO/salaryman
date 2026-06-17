/**
 * Story gate — pre-story city confinement.
 *
 * Before the player begins the story (server-authoritative `story.active`), the
 * city (/world/play, /world/land) is locked and the player is confined to the
 * office. The office surfaces a "BEGIN STORY" path that flips story.active
 * BEFORE navigating to the city, so the city gate opens and the player is never
 * soft-locked behind a door they can't open.
 *
 * Authority order:
 *  1. Server `GET /api/salaryman/story/:slot` → story.active is the source of
 *     truth. A locked server result downgrades any optimistic open.
 *  2. Local `sm_save.story.active` + a short-lived "begin intent" flag let the
 *     city render immediately on navigation (optimistic), before the server
 *     round-trip resolves, so the begin-story → city hop never flashes a lock.
 */
import { apiFetch } from '@/lib/api-client';

/** sessionStorage flag set the instant the office "BEGIN STORY" CTA is pressed,
 *  so the very next /world/play render opens optimistically before the server
 *  PUT/GET resolves. Cleared once the office confirms story.active. */
const INTENT_KEY = 'sm_story_begin_intent';

/** Resolve the active save slot the same way the rest of the game does. */
export function currentSlot(): number {
  try {
    return parseInt(localStorage.getItem('sm_slot') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Read `story.active` from the locally-cached save blob (best-effort). */
export function readLocalStoryActive(): boolean {
  try {
    const raw = localStorage.getItem('sm_save');
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { story?: { active?: boolean }; data?: { story?: { active?: boolean } } };
    return !!(parsed?.story?.active ?? parsed?.data?.story?.active);
  } catch {
    return false;
  }
}

export function setStoryBeginIntent(): void {
  try { sessionStorage.setItem(INTENT_KEY, '1'); } catch { /* ignore */ }
}

export function readStoryBeginIntent(): boolean {
  try { return sessionStorage.getItem(INTENT_KEY) === '1'; } catch { return false; }
}

export function clearStoryBeginIntent(): void {
  try { sessionStorage.removeItem(INTENT_KEY); } catch { /* ignore */ }
}

/**
 * Server-authoritative `story.active` for the current slot. Returns:
 *  - `true`  → story begun, city open
 *  - `false` → story not begun, city locked
 *  - `null`  → unknown (unauthenticated / network error) → caller falls back
 *              to the local flag so a transient failure never hard-locks.
 */
export async function fetchServerStoryActive(slot = currentSlot()): Promise<boolean | null> {
  try {
    const res = await apiFetch(`/api/salaryman/story/${slot}`, { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { story?: { active?: boolean } };
    return !!body?.story?.active;
  } catch {
    return null;
  }
}
