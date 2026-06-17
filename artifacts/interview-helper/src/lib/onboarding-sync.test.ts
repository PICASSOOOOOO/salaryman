// @vitest-environment jsdom
//
// Covers the CLIENT half of the server-authoritative onboarding skip — the glue
// that lets a returning, already-onboarded user land on /office instead of being
// looped back through the immigration intake on a fresh device / cleared browser.
//
// hydrateOnboardingStatus():
//   • If the local salaryman_tutorial_done flag is already set, resolve instantly
//     with NO network call (cleared user on their usual device).
//   • Else hit GET /world/my-business: a world-business row → flip the local flag
//     so every routing gate treats the user as cleared.
//   • No row / non-ok / network error → leave the flag unset so a brand-new user
//     still runs the full intake.
//   • Resolves the subscribable "resolved" state in every case so gates that hold
//     until resolution can proceed.
//
// apiFetch is mocked so no real network happens. The module keeps module-level
// state (the resolved latch + in-flight promise), so each test resets modules and
// re-imports a fresh copy.
import { describe, it, expect, vi, beforeEach } from "vitest";

const TUTORIAL_KEY = "salaryman_tutorial_done";

const apiFetch = vi.fn();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function fakeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

// Fresh module instance (clears the resolved latch + any in-flight promise).
async function loadModule() {
  vi.resetModules();
  return import("./onboarding-sync");
}

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
});

describe("hydrateOnboardingStatus", () => {
  it("flips the local flag when the server reports a world business row", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [{ id: "biz-1" }] }));

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await hydrateOnboardingStatus();

    expect(apiFetch).toHaveBeenCalledWith("/api/world/my-business");
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe("1");
    expect(getOnboardingResolved()).toBe(true);
  });

  it("leaves the flag unset for a brand-new user with no business row", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [] }));

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await hydrateOnboardingStatus();

    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
    expect(getOnboardingResolved()).toBe(true);
  });

  it("resolves instantly with NO network call when the local flag is already set", async () => {
    localStorage.setItem(TUTORIAL_KEY, "1");

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await hydrateOnboardingStatus();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(getOnboardingResolved()).toBe(true);
  });

  it("leaves the flag unset (but still resolves) when the response is not ok", async () => {
    apiFetch.mockResolvedValue(fakeResponse(null, false));

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await hydrateOnboardingStatus();

    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
    expect(getOnboardingResolved()).toBe(true);
  });

  it("swallows network errors, keeps the flag unset, and still resolves", async () => {
    apiFetch.mockRejectedValue(new Error("offline"));

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await expect(hydrateOnboardingStatus()).resolves.toBeUndefined();

    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
    expect(getOnboardingResolved()).toBe(true);
  });

  it("coalesces concurrent calls into a single network request", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [{ id: "biz-1" }] }));

    const { hydrateOnboardingStatus } = await loadModule();
    await Promise.all([hydrateOnboardingStatus(), hydrateOnboardingStatus()]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("is a no-op once already resolved", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [] }));

    const { hydrateOnboardingStatus } = await loadModule();
    await hydrateOnboardingStatus();
    await hydrateOnboardingStatus();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers when the status resolves", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [] }));

    const { hydrateOnboardingStatus, subscribeOnboardingResolved } = await loadModule();
    const cb = vi.fn();
    const unsub = subscribeOnboardingResolved(cb);

    await hydrateOnboardingStatus();

    expect(cb).toHaveBeenCalled();
    unsub();
  });
});
