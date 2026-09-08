// @vitest-environment jsdom
//
// Covers the CONCURRENT-EDIT story that cross-device settings sync actually
// promises: a player flips a display preference on two devices (or two tabs) at
// once. Single-device behaviour is proven in settings-sync.test.ts (hydrate
// merge, debounced push, 401/offline no-op) and lowGfx.test.tsx (the cross-tab
// `storage` event re-applies the <html class="low-gfx"> class). What was missing
// is the RACE between the two halves:
//
//   1. A remote change (cross-tab `storage` event) for the low-gfx key arriving
//      while a settings-sync push is still pending. The real useLowGfx hook must
//      re-apply the class, AND the pending push must carry the REMOTE value up,
//      not the stale one that was current when the debounce was scheduled.
//   2. Last-write ordering: settings-sync's debounced push reads localStorage at
//      FIRE time, not at schedule time, so a stale in-flight debounce can never
//      clobber a newer value that landed (from another device) in between.
//
// We drive the REAL lowGfx hook and the REAL settings-sync module together —
// the whole point is their localStorage/event interplay — and only mock
// apiFetch so no network happens. settings-sync keeps module-level state (the
// "already started" guard + the pending timer), so each test resets modules and
// re-imports a fresh copy; its window listeners survive vi.resetModules, so we
// always tear them down.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useLowGfx } from "./lowGfx";

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// A single mutable apiFetch mock shared by the hoisted module mock. Each test
// reads `.mock.calls` to assert on the PUT payload the debounced push sends.
const apiFetch = vi.fn();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

function fakeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => body,
  } as unknown as Response;
}

// Fresh settings-sync instance (clears the syncStarted guard + any pending timer).
async function loadSettingsSync() {
  vi.resetModules();
  // Re-mock after resetModules so the fresh copy still gets the spy.
  vi.doMock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
  return import("./settings-sync");
}

let teardown: (() => void) | null = null;

// ── useLowGfx harness ────────────────────────────────────────────────────────
let captured: ReturnType<typeof useLowGfx> | null = null;
function Capture() {
  captured = useLowGfx();
  return null;
}
let root: Root;
let container: HTMLDivElement;

function mountHook() {
  act(() => {
    root.render(<Capture />);
  });
}

// jsdom never fires `storage` for our OWN writes (the spec only delivers them to
// OTHER documents), so we simulate the cross-tab signal the browser would send
// to the second device/tab after it wrote the new value.
function fireStorage(key: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key }));
  });
}

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
  document.documentElement.classList.remove("low-gfx");
  teardown = null;
  captured = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  teardown?.();
  teardown = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("concurrent cross-device settings edits", () => {
  it("a cross-tab low-gfx change re-applies the class AND the pending push carries the remote value (not the stale one)", async () => {
    vi.useFakeTimers();
    // This device starts with low-gfx OFF and some local settings.
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadSettingsSync();
    teardown = initSettingsSync();
    mountHook();
    expect(captured![0]).toBe(false);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(false);

    // The player tweaks a display setting here → schedules a debounced push. At
    // this instant low-gfx is still OFF, so a naive snapshot-at-schedule push
    // would later upload lowGfx:false.
    window.dispatchEvent(new Event("sm-settings-changed"));
    expect(apiFetch).not.toHaveBeenCalled(); // still debounced — push "in flight"

    // Meanwhile the OTHER device turns low-gfx ON. The browser delivers that to
    // this tab as a `storage` event after the new value is already in storage.
    localStorage.setItem(LOW_GFX_KEY, "1");
    fireStorage(LOW_GFX_KEY);

    // The hook must re-apply the <html> class + flip its state immediately, even
    // though our in-page setLowGfx() never ran on this tab.
    expect(captured![0]).toBe(true);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);

    // Now the still-pending debounce fires. Because pushSettingsToServer reads
    // localStorage at FIRE time, it uploads the REMOTE low-gfx value, so the
    // stale "low-gfx off" intent can't overwrite the newer "on".
    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, opts] = apiFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ settings: { bloom: true }, lowGfx: true });
  });

  it("last-write ordering: a stale debounce uploads the newer value that landed in between, never the value at schedule time", async () => {
    vi.useFakeTimers();
    // Schedule-time state: bloom on, no master.
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadSettingsSync();
    teardown = initSettingsSync();

    // A local change schedules the (soon-to-be-stale) push.
    window.dispatchEvent(new Event("sm-settings-changed"));

    // Before the timer fires, the OTHER device's newer settings blob lands via a
    // cross-tab write. settings-sync does NOT listen to `storage`, so this does
    // NOT reschedule — the original, now-stale timer is still the one pending.
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false, master: 0.9 }));
    fireStorage(STORE_KEY);

    await vi.runAllTimersAsync();

    // Exactly one push, and it carries the NEWER value — proving the stale
    // debounce read storage at fire time and could not clobber the newer blob.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, opts] = apiFetch.mock.calls[0];
    expect(JSON.parse(opts.body).settings).toEqual({ bloom: false, master: 0.9 });
  });

  it("two display changes from both devices coalesce into a single up-to-date push", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: true }));
    apiFetch.mockResolvedValue(fakeResponse({ ok: true }));

    const { initSettingsSync } = await loadSettingsSync();
    teardown = initSettingsSync();
    mountHook();

    // Local edit + a remote low-gfx flip + another local edit, all inside one
    // debounce window. The cross-tab low-gfx event re-applies the class via the
    // hook; the in-page events keep the push scheduled.
    window.dispatchEvent(new Event("sm-settings-changed"));
    localStorage.setItem(LOW_GFX_KEY, "1");
    fireStorage(LOW_GFX_KEY);
    window.dispatchEvent(new Event("sm-settings-changed"));

    expect(captured![0]).toBe(true);
    expect(document.documentElement.classList.contains("low-gfx")).toBe(true);

    await vi.runAllTimersAsync();

    // One coalesced push with the final, merged state from both devices.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, opts] = apiFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ settings: { bloom: true }, lowGfx: true });
  });
});
