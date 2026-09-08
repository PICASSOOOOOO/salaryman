// @vitest-environment jsdom
//
// Verifies the explicit, immediate settings flush used by the Settings page's
// "RESET SETTINGS TO DEFAULTS" button. Resetting must overwrite the synced
// server-side copy (users.gameSettings) right away — otherwise the cleared
// device, or another device, re-hydrates the old (pre-reset) values on next
// load now that settings sync across devices.
//
// flushSettingsToServer() PUTs the CURRENT local blob (sm_game_settings_v1) plus
// the low-graphics flag immediately, bypassing the 1s debounce. apiFetch is
// mocked so we assert the request shape without a network call; a 401 (logged
// out) is swallowed by the caller, so the local-only reset stays untouched.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
vi.mock("./api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

beforeEach(() => {
  apiFetchMock.mockClear();
  localStorage.clear();
});

describe("flushSettingsToServer", () => {
  it("immediately PUTs the current local settings + lowGfx to the account", async () => {
    const { flushSettingsToServer } = await import("./settings-sync");

    // Simulate the state the reset button leaves behind: default game keys in
    // the shared blob, low-graphics turned off.
    const defaults = { resolution: "auto", uiScale: 1.0, bloom: true };
    localStorage.setItem(STORE_KEY, JSON.stringify(defaults));
    localStorage.removeItem(LOW_GFX_KEY); // off = default

    flushSettingsToServer();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/account/settings");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body as string) as {
      settings: Record<string, unknown>;
      lowGfx: boolean;
    };
    expect(body.settings).toEqual(defaults);
    expect(body.lowGfx).toBe(false);
  });

  it("reflects a low-graphics ON flag in the pushed blob", async () => {
    const { flushSettingsToServer } = await import("./settings-sync");

    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false }));
    localStorage.setItem(LOW_GFX_KEY, "1");

    flushSettingsToServer();

    const [, opts] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { lowGfx: boolean };
    expect(body.lowGfx).toBe(true);
  });

  it("is a safe no-op when logged out (401) — the local reset stays untouched", async () => {
    const { flushSettingsToServer } = await import("./settings-sync");
    const defaults = { resolution: "auto", bloom: true };
    localStorage.setItem(STORE_KEY, JSON.stringify(defaults));
    // A signed-out flush resolves with a non-ok 401; flush ignores the result.
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    expect(() => flushSettingsToServer()).not.toThrow();
    // Let the (ignored) promise settle, then confirm the local blob is intact.
    await Promise.resolve();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(defaults);
  });

  it("swallows a rejected (offline) flush without throwing", async () => {
    const { flushSettingsToServer } = await import("./settings-sync");
    const defaults = { bloom: false };
    localStorage.setItem(STORE_KEY, JSON.stringify(defaults));
    apiFetchMock.mockRejectedValueOnce(new Error("offline"));

    expect(() => flushSettingsToServer()).not.toThrow();
    await Promise.resolve();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(defaults);
  });
});
