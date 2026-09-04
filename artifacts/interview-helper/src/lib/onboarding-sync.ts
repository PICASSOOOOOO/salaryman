import { apiFetch } from "./api-client";
import { CITY_DEFS, setActiveCityId } from "./city-defs";
import { resetBuildingOnboarding } from "./building-onboarding";
import { isTutorialDone, markTutorialDone, resetTutorial } from "./tutorial-progress";

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

function applyServerHomeCity(value: unknown): void {
  if (typeof window === "undefined" || typeof value !== "string" || !CITY_DEFS[value]) return;
  try {
    const raw = window.localStorage.getItem("sm_save");
    const prior = raw ? JSON.parse(raw) : {};
    const save = prior && typeof prior === "object" ? prior : {};
    const currentCityId = typeof save.cityId === "string" && CITY_DEFS[save.cityId]
      ? save.cityId
      : value;
    setActiveCityId(currentCityId);
    // Home city is identity metadata, not the current traveled realm. Seed the
    // current city only on a fresh device/save where no valid destination exists.
    window.localStorage.setItem("sm_save", JSON.stringify({
      ...save,
      homeCityId: value,
      cityId: currentCityId,
    }));
  } catch {
    setActiveCityId(value);
  }
}

// Pull the server's onboarding-complete signal once. Idempotent: repeated calls
// return the same in-flight promise, and once resolved it's a no-op.
// - If the server reports a world business row (already onboarded), set the
//   local flag so every gate flips to "cleared".
// - The separately scoped home-city read is always made after sign-in, including
//   on a device that has the local tutorial flag, so the server choice wins
//   across devices and is available before office/HUD/world routes mount.
// - The gate resolves only after an authoritative saves response. On a network,
//   non-OK, or malformed saves response, keep protected surfaces fail-closed.
export function hydrateOnboardingStatus(): Promise<void> {
  if (resolved) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let authoritativeSavesRead = false;
    try {
      const [businessResult, homeCityResult, savesResult] = await Promise.allSettled([
        apiFetch("/api/world/my-business"),
        apiFetch("/api/world/home-city"),
        apiFetch("/api/salaryman/saves"),
      ]);
      if (savesResult.status === "fulfilled" && savesResult.value.ok) {
        const data = (await savesResult.value.json()) as { saves?: unknown };
        if (Array.isArray(data.saves)) {
          authoritativeSavesRead = true;
          if (data.saves.length === 0) {
            // A successful empty save list is the reset signal. Never clear local
            // onboarding state on a network error or a non-OK response.
            resetTutorial();
            resetBuildingOnboarding();
          }
        }
      }
      if (businessResult.status === "fulfilled" && businessResult.value.ok) {
        const data = (await businessResult.value.json()) as { businesses?: unknown };
        if (Array.isArray(data.businesses) && data.businesses.length > 0) {
          // Server says this user already onboarded — flip the local flag so
          // App.tsx / AppShell / NavBar / Immigration all treat them as cleared.
          markTutorialDone();
        }
      }
      if (homeCityResult.status === "fulfilled" && homeCityResult.value.ok) {
        const data = (await homeCityResult.value.json()) as { homeCityId?: unknown };
        applyServerHomeCity(data.homeCityId);
      }
    } catch {
      // Keep protected routes held until a future load can verify server state.
    } finally {
      if (authoritativeSavesRead) markResolved();
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
