// @vitest-environment jsdom
//
// Covers the AUTH GATE around cross-device settings sync — the conditional that
// decides whether the display / sound / control preferences follow you to
// another device at all. The module functions themselves (hydrate merge +
// debounce push) are proven in settings-sync.test.ts; what this file locks down
// is the wiring in App.tsx that runs them ONLY while signed in:
//
//   useEffect(() => {
//     if (!isAuthenticated) return;       // ← the gate under test
//     void hydrateSettingsFromServer();
//     const teardown = initSettingsSync();
//     return teardown;
//   }, [isAuthenticated]);
//
// We mount a tiny harness that mirrors that effect exactly, driving it with a
// mocked useAuth, and assert:
//   • signed OUT  → nothing is pulled or pushed; the local blob stays untouched
//                   (local-only flow undisturbed), even when settings change.
//   • signed IN   → the account blob is hydrated into local on mount, and a
//                   later local change is debounce-pushed back up.
//   • flips to authed → sync only starts once the user becomes authenticated.
//
// apiFetch is mocked so no real network happens. settings-sync keeps module-level
// state (the "already started" guard + the pending push timer), so each test
// loads a fresh copy via vi.resetModules and passes its functions into the
// harness, and afterEach unmounts to run the effect teardown (which clears the
// guard + listeners).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useEffect } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAuth } from "@/hooks/use-auth";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// Mutable auth state the mocked useAuth reads. Tests flip `isAuthenticated`
// and re-render to exercise the gate.
const authState = { isAuthenticated: false };
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authState,
}));

// Single mutable apiFetch mock. GETs (hydrate) return a saved blob; PUTs (push)
// just resolve ok. We read `.mock.calls` to assert what crossed the wire.
const apiFetch = vi.fn();
vi.mock("./api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function fakeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

// Fresh settings-sync instance (resets the syncStarted guard + pending timer).
async function loadModule() {
  vi.resetModules();
  return import("./settings-sync");
}

// Harness mirroring App.tsx's auth-gated settings-sync effect. Takes the freshly
// loaded module functions as props so each test runs an isolated module copy.
function SettingsSyncGate(props: {
  hydrate: () => Promise<void>;
  init: () => () => void;
}) {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    void props.hydrate();
    const teardown = props.init();
    return teardown;
  }, [isAuthenticated]);
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
}

function rerender(element: React.ReactElement) {
  act(() => {
    root!.render(element);
  });
}

beforeEach(() => {
  apiFetch.mockReset();
  authState.isAuthenticated = false;
  localStorage.clear();
  document.documentElement.classList.remove("low-gfx");
});

afterEach(() => {
  // Unmount so the effect teardown fires (clears settings-sync listeners + the
  // syncStarted guard) before the next test loads a fresh module.
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("settings-sync auth gate", () => {
  it("does NOT hydrate or push when signed out — settings stay local-only", async () => {
    vi.useFakeTimers();
    const local = { bloom: true, cameraZoom: 1.4, deviceOnly: "keep" };
    localStorage.setItem(STORE_KEY, JSON.stringify(local));
    localStorage.setItem(LOW_GFX_KEY, "1");

    const { hydrateSettingsFromServer, initSettingsSync } = await loadModule();
    mount(
      createElement(SettingsSyncGate, {
        hydrate: hydrateSettingsFromServer,
        init: initSettingsSync,
      }),
    );

    // A local settings change while logged out must never reach the server.
    window.dispatchEvent(new Event("sm-settings-changed"));
    window.dispatchEvent(new Event("salaryman:lowgfx-changed"));
    await vi.runAllTimersAsync();

    expect(apiFetch).not.toHaveBeenCalled();
    // Local blob is exactly what the device had — nothing was hydrated over it.
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(local);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
  });

  it("hydrates the account blob into local on load when authenticated", async () => {
    authState.isAuthenticated = true;
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ bloom: true, cameraZoom: 1.2, deviceOnly: "keep" }),
    );
    apiFetch.mockResolvedValue(
      fakeResponse({ settings: { bloom: false, master: 0.3 }, lowGfx: null }),
    );

    const { hydrateSettingsFromServer, initSettingsSync } = await loadModule();
    await act(async () => {
      mount(
        createElement(SettingsSyncGate, {
          hydrate: hydrateSettingsFromServer,
          init: initSettingsSync,
        }),
      );
    });

    // Hydrate pulled the saved account preferences...
    expect(apiFetch).toHaveBeenCalledWith("/api/account/settings");
    const merged = JSON.parse(localStorage.getItem(STORE_KEY)!);
    expect(merged.bloom).toBe(false); // server wins
    expect(merged.master).toBe(0.3); // server-only key arrives on this device
    expect(merged.cameraZoom).toBe(1.2); // untouched local key survives
    expect(merged.deviceOnly).toBe("keep"); // local-only key survives
  });

  it("debounce-pushes a later local change when authenticated", async () => {
    authState.isAuthenticated = true;
    // hydrate GET resolves with nothing; subsequent PUT also resolves ok.
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: null }));

    const { hydrateSettingsFromServer, initSettingsSync } = await loadModule();
    await act(async () => {
      mount(
        createElement(SettingsSyncGate, {
          hydrate: hydrateSettingsFromServer,
          init: initSettingsSync,
        }),
      );
    });
    apiFetch.mockClear(); // drop the mount-time hydrate GET

    vi.useFakeTimers();
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false, master: 0.7 }));
    localStorage.setItem(LOW_GFX_KEY, "1");
    window.dispatchEvent(new Event("sm-settings-changed"));
    // Debounced — nothing yet.
    expect(apiFetch).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/account/settings");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body as string)).toEqual({
      settings: { bloom: false, master: 0.7 },
      lowGfx: true,
    });
  });

  it("starts syncing only once the user becomes authenticated", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: null }));

    const { hydrateSettingsFromServer, initSettingsSync } = await loadModule();
    const makeElement = () =>
      createElement(SettingsSyncGate, {
        hydrate: hydrateSettingsFromServer,
        init: initSettingsSync,
      });

    // Mounted signed out: a change does nothing.
    mount(makeElement());
    window.dispatchEvent(new Event("sm-settings-changed"));
    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();

    // Sign in: the effect re-runs and hydrate pulls the account blob.
    authState.isAuthenticated = true;
    await act(async () => {
      rerender(makeElement());
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/account/settings");
  });
});
