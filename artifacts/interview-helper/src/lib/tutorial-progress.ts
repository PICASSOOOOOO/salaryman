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
