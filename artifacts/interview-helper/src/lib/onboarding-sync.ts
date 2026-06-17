import { apiFetch } from "./api-client";
import { isTutorialDone, markTutorialDone } from "./tutorial-progress";

// ── Server-authoritative onboarding-complete signal ──────────────────────────
// "Has this user finished onboarding?" is normally tracked only in localStorage
// (salaryman_tutorial_done, read by isTutorialDone()). That breaks for a
// returning, already-onboarded user who signs in on a fresh device or after
// clearing their browser: the local flag is missing, so every routing gate
// (App.tsx HomeOrCover, AppShell, NavBar, Immigration) treats them as brand new
// and force-redirects them through the /immigration intake again.
//
// The server already knows the truth: an already-onboarded user has a row in
// worldBusinessesTable, exposed via GET /world/my-business. This module checks
// that once after sign-in and, when the server says the user already onboarded,
// flips the local flag via markTutorialDone() so all existing gates immediately
// treat them as cleared — no re-charge (the skip path never calls the housing
// charge endpoint) and no replayed intake.
//
// Until the check resolves, gates must HOLD rather than bounce a cleared user
// into intake. Consumers read getOnboardingResolved() directly or subscribe via
// the useOnboardingResolved() hook below.

import { useSyncExternalStore } from "react";

let resolved = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeOnboardingResolved(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getOnboardingResolved(): boolean {
  return resolved;
}

function markResolved(): void {
  if (resolved) return;
  resolved = true;
  emit();
}

// Pull the server's onboarding-complete signal once. Idempotent: repeated calls
// return the same in-flight promise, and once resolved it's a no-op.
// - If the local flag is already set, the user is cleared — resolve immediately
//   without a round-trip.
// - If the server reports a world business row (already onboarded), set the
//   local flag so every gate flips to "cleared".
// - On any error / no row, leave the flag untouched so a genuinely brand-new
//   user still falls through to the full immigration intake.
export function hydrateOnboardingStatus(): Promise<void> {
  if (resolved) return Promise.resolve();
  if (inFlight) return inFlight;

  // Already cleared on this device — nothing to check.
  if (isTutorialDone()) {
    markResolved();
    return Promise.resolve();
  }

  inFlight = (async () => {
    try {
      const res = await apiFetch("/api/world/my-business");
      if (res.ok) {
        const data = (await res.json()) as { businesses?: unknown };
        if (Array.isArray(data.businesses) && data.businesses.length > 0) {
          // Server says this user already onboarded — flip the local flag so
          // App.tsx / AppShell / NavBar / Immigration all treat them as cleared.
          markTutorialDone();
        }
      }
    } catch {
      // Offline / transient error — keep the local-only flow. A brand-new user
      // (no server record) still runs the full intake; a returning user can
      // retry on the next load.
    } finally {
      markResolved();
      inFlight = null;
    }
  })();

  return inFlight;
}

// React hook: re-renders the consumer when the onboarding status resolves so a
// routing gate can hold (return a loading screen) until the server check is
// done, then flip to the resolved decision.
export function useOnboardingResolved(): boolean {
  return useSyncExternalStore(
    subscribeOnboardingResolved,
    getOnboardingResolved,
    // Server snapshot (SSR): treat as resolved so we never hold during SSR.
    () => true,
  );
}
