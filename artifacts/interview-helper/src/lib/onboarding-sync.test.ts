// @vitest-environment jsdom
//
// Covers the CLIENT half of the server-authoritative onboarding skip — the glue
// that lets a returning, already-onboarded user land on /office instead of being
// looped back through the immigration intake on a fresh device / cleared browser.
//
// hydrateOnboardingStatus():
//   • GET /world/my-business: a world-business row → flip the local flag
//     so every routing gate treats the user as cleared.
//   • GET /world/home-city: the server-owned home city becomes both the active
//     realm and the cached current city, without reading location metadata.
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

  it("hydrates home city without replacing a valid traveled current city", async () => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    localStorage.setItem("sm_save", JSON.stringify({ cityId: "minx_city", savings: 42 }));
    apiFetch.mockImplementation((path: string) => Promise.resolve(
      path === "/api/world/home-city"
        ? fakeResponse({ homeCityId: "huda_city" })
        : fakeResponse({ businesses: [] }),
    ));

    const { hydrateOnboardingStatus, getOnboardingResolved } = await loadModule();
    await hydrateOnboardingStatus();

    expect(apiFetch).toHaveBeenCalledWith("/api/world/home-city");
    expect(JSON.parse(localStorage.getItem("sm_save") ?? "{}")).toMatchObject({
      cityId: "minx_city",
      homeCityId: "huda_city",
      savings: 42,
    });
    expect(getOnboardingResolved()).toBe(true);
  });

  it("does not overwrite the local city for an unknown server city", async () => {
    localStorage.setItem("sm_save", JSON.stringify({ cityId: "minx_city" }));
    apiFetch.mockImplementation((path: string) => Promise.resolve(
      path === "/api/world/home-city"
        ? fakeResponse({ homeCityId: "not_a_live_city" })
        : fakeResponse({ businesses: [] }),
    ));

    const { hydrateOnboardingStatus } = await loadModule();
    await hydrateOnboardingStatus();

    expect(JSON.parse(localStorage.getItem("sm_save") ?? "{}").cityId).toBe("minx_city");
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

    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("is a no-op once already resolved", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ businesses: [] }));

    const { hydrateOnboardingStatus } = await loadModule();
    await hydrateOnboardingStatus();
    await hydrateOnboardingStatus();

    expect(apiFetch).toHaveBeenCalledTimes(3);
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

  it("clears stale local onboarding when authenticated saves are successfully empty", async () => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    localStorage.setItem("salaryman_building_onboarding_v1", "complete");
    apiFetch.mockImplementation((path: string) => Promise.resolve(
      path === "/api/salaryman/saves"
        ? fakeResponse({ saves: [] })
        : path === "/api/world/home-city"
          ? fakeResponse({ homeCityId: "minx_city" })
          : fakeResponse({ businesses: [] }),
    ));

    const { hydrateOnboardingStatus } = await loadModule();
    await hydrateOnboardingStatus();

    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
    expect(localStorage.getItem("salaryman_building_onboarding_v1")).toBeNull();
  });
});
