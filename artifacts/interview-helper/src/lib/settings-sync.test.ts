// @vitest-environment jsdom
//
// Covers the CLIENT half of cross-device settings sync — the part that makes the
// display / visual-quality preferences "follow you across devices." The server
// endpoints are unit-tested separately (api-server account.settings.test.ts);
// here we prove the browser-side glue works:
//
//   • hydrateSettingsFromServer() — pulls the saved account blob after sign-in
//     and merges it into the local stores: SERVER WINS per key, but local-only
//     keys survive, and the server's lowGfx flag is applied through the real
//     lowGfx helper (localStorage + <html> class + change event).
//   • initSettingsSync() — debounce-pushes local changes back up when either the
//     game-settings event (sm-settings-changed) or the low-graphics event
//     (salaryman:lowgfx-changed) fires.
//
// apiFetch is mocked so no real network happens. The lowGfx module is REAL — the
// hydrate path depends on its localStorage/event behaviour, so mocking it would
// hide the integration we care about. settings-sync keeps module-level state
// (the "already started" guard + the pending push timer), so each test resets
// modules and re-imports a fresh copy.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// A single mutable apiFetch mock shared by the hoisted module mock. Each test
// swaps in its own implementation, and we read `.mock.calls` to assert on the
// PUT payload the push sends.
const apiFetch = vi.fn();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function fakeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

// Fresh module instance (clears the syncStarted guard + any pending timer).
async function loadModule() {
  vi.resetModules();
  return import("./settings-sync");
}

// initSettingsSync attaches listeners to `window`, which survives vi.resetModules
// (jsdom keeps one window across module reloads). If a test left its listeners
// attached, a later dispatch would also trigger the previous module's push. Each
// init test stores its teardown here so afterEach can detach them.
let teardown: (() => void) | null = null;

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
  document.documentElement.classList.remove("low-gfx");
  teardown = null;
});

afterEach(() => {
  teardown?.();
  teardown = null;
  vi.useRealTimers();
});

describe("hydrateSettingsFromServer", () => {
  it("merges server values over local — server wins per key, local-only keys survive", async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ bloom: true, cameraZoom: 1.2, deviceOnly: "keep" }),
    );
    apiFetch.mockResolvedValue(
      fakeResponse({ settings: { bloom: false, master: 0.3 }, lowGfx: null }),
    );

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    const merged = JSON.parse(localStorage.getItem(STORE_KEY)!);
    expect(merged.bloom).toBe(false); // server overrides local
    expect(merged.master).toBe(0.3); // server-only key added
    expect(merged.cameraZoom).toBe(1.2); // local key the server didn't touch
    expect(merged.deviceOnly).toBe("keep"); // local-only key survives
  });

  it("starts from empty when there is no local blob", async () => {
    apiFetch.mockResolvedValue(
      fakeResponse({ settings: { groundGlow: false }, lowGfx: null }),
    );

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual({ groundGlow: false });
  });

  it("applies the server lowGfx flag through the lowGfx helper", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: true }));
    const onLowGfx = vi.fn();
    window.addEventListener("salaryman:lowgfx-changed", onLowGfx);

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);
    // setLowGfx fans out its own change event so the live world renderer and the
    // Settings toggle both react to the hydrated value.
    expect(onLowGfx).toHaveBeenCalledTimes(1);
    window.removeEventListener("salaryman:lowgfx-changed", onLowGfx);
  });

  it("skips the lowGfx apply (no redundant event) when it already matches", async () => {
    localStorage.setItem(LOW_GFX_KEY, "1");
    document.documentElement.classList.add("low-gfx");
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: true }));
    const onLowGfx = vi.fn();
    window.addEventListener("salaryman:lowgfx-changed", onLowGfx);

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
    expect(onLowGfx).not.toHaveBeenCalled();
    window.removeEventListener("salaryman:lowgfx-changed", onLowGfx);
  });

  it("clears lowGfx when the server says it is off", async () => {
    localStorage.setItem(LOW_GFX_KEY, "1");
    document.documentElement.classList.add("low-gfx");
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: false }));

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(localStorage.getItem(LOW_GFX_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);
  });

  it("leaves lowGfx untouched when the server returns null", async () => {
    localStorage.setItem(LOW_GFX_KEY, "1");
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: null }));

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
  });

  it("dispatches sm-settings-changed after merging settings", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ settings: { bloom: false }, lowGfx: null }));
    const onChanged = vi.fn();
    window.addEventListener("sm-settings-changed", onChanged);

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(onChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("sm-settings-changed", onChanged);
  });

  it("does NOT dispatch sm-settings-changed (or write the blob) when the server has no settings", async () => {
    apiFetch.mockResolvedValue(fakeResponse({ settings: null, lowGfx: false }));
    const onChanged = vi.fn();
    window.addEventListener("sm-settings-changed", onChanged);

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(onChanged).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORE_KEY)).toBeNull();
    window.removeEventListener("sm-settings-changed", onChanged);
  });

  it("no-ops the local blob when the response is not ok", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockResolvedValue(fakeResponse(null, false));

    const { hydrateSettingsFromServer } = await loadModule();
    await hydrateSettingsFromServer();

    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual({ bloom: true });
  });

  it("swallows network errors and keeps the local blob intact", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockRejectedValue(new Error("offline"));

    const { hydrateSettingsFromServer } = await loadModule();
    await expect(hydrateSettingsFromServer()).resolves.toBeUndefined();

    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual({ bloom: true });
  });
});

describe("initSettingsSync", () => {
  it("debounce-pushes the local settings + lowGfx on sm-settings-changed", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false, master: 0.7 }));
    localStorage.setItem(LOW_GFX_KEY, "1");
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadModule();
    teardown = initSettingsSync();

    window.dispatchEvent(new Event("sm-settings-changed"));
    // Nothing yet — the push is debounced.
    expect(apiFetch).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/account/settings");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({
      settings: { bloom: false, master: 0.7 },
      lowGfx: true,
    });
  });

  it("also pushes on salaryman:lowgfx-changed", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadModule();
    teardown = initSettingsSync();

    window.dispatchEvent(new Event("salaryman:lowgfx-changed"));
    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe("/api/account/settings");
  });

  it("coalesces rapid changes into a single push", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadModule();
    teardown = initSettingsSync();

    window.dispatchEvent(new Event("sm-settings-changed"));
    window.dispatchEvent(new Event("salaryman:lowgfx-changed"));
    window.dispatchEvent(new Event("sm-settings-changed"));
    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("the teardown stops further pushes", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadModule();
    const stop = initSettingsSync();
    stop();

    window.dispatchEvent(new Event("sm-settings-changed"));
    await vi.runAllTimersAsync();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("is a safe no-op when the debounced push hits a 401 (logged out)", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false }));
    // A logged-out PUT resolves with a non-ok 401; the push fires but ignores it.
    apiFetch.mockResolvedValue(fakeResponse({ error: "unauthorized" }, false));

    const { initSettingsSync } = await loadModule();
    teardown = initSettingsSync();

    window.dispatchEvent(new Event("sm-settings-changed"));
    await vi.runAllTimersAsync();

    // The request was attempted but the local blob is left exactly as-is, so the
    // local-only flow keeps working for a signed-out player.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual({ bloom: false });
  });

  it("swallows a rejected (offline) debounced push without throwing", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockRejectedValue(new Error("offline"));

    const { initSettingsSync } = await loadModule();
    teardown = initSettingsSync();

    window.dispatchEvent(new Event("sm-settings-changed"));
    // Draining the timers flushes the push; the rejection must not surface as an
    // unhandled error and the local blob must survive.
    await expect(vi.runAllTimersAsync()).resolves.toBeDefined();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual({ bloom: true });
  });
});
