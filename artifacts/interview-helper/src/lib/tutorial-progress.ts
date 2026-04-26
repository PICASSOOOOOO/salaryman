// Single source of truth for whether the user has completed the Pablo
// onboarding tutorial. The tutorial plays once on the user's first /game
// visit and never replays (per product direction). Returning users skip
// straight to /pablo.

const KEY = "salaryman_tutorial_done";

export function isTutorialDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markTutorialDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {}
}

// Used by a future "replay tutorial" admin/debug action.
export function resetTutorial(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(PASSCODE_KEY);
  } catch {}
}

// Tracks whether the user has spoken/entered the Pablo passcode at least
// once. Distinct from tutorial-done: hearing the passcode unlocks the
// landing page, but the actual app/world is only unlocked after Pablo
// runs the guided tour from landing -> Get Started -> /pablo?guided=1.
const PASSCODE_KEY = "salaryman_passcode_unlocked";

export function isPasscodeUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PASSCODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPasscodeUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSCODE_KEY, "1");
  } catch {}
}

// Salaryman identity Pablo collects during the post-passcode intro. Email
// is informational here — the actual login is OAuth — but we keep both so
// the rest of the app can address the player by name without a round-trip.
const NAME_KEY = "salaryman_name";
const EMAIL_KEY = "salaryman_email";

export function setSalarymanName(name: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(NAME_KEY, name.slice(0, 32)); } catch {}
}
export function getSalarymanName(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(NAME_KEY); } catch { return null; }
}
export function setSalarymanEmail(email: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(EMAIL_KEY, email.slice(0, 120)); } catch {}
}
export function getSalarymanEmail(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

// Pre-onboarding employment intent: captured in the Pablo intro before
// the user signs in, so the post-OAuth PabloOnboarding modal in WorldPlay
// can pre-select the right path (business vs unemployed) instead of
// re-asking. Mirrors the bizPath union the modal already uses.
const BIZ_PATH_KEY = "salaryman_biz_path";
export type SalarymanBizPath = "business" | "unemployed";
export function setSalarymanBizPath(path: SalarymanBizPath): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(BIZ_PATH_KEY, path); } catch {}
}
export function getSalarymanBizPath(): SalarymanBizPath | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(BIZ_PATH_KEY);
    return v === "business" || v === "unemployed" ? v : null;
  } catch {
    return null;
  }
}

// Lightweight email validation. Pablo isn't doing RFC 5322 here — just
// enough to reject obvious garbage so we don't ship the user into the
// OAuth flow with a malformed identifier.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isLikelyEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}
