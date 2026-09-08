// CROSS-DEVICE SETTINGS SYNC — END-TO-END CONTRACT TEST
//
// The two halves of cross-device settings sync are already unit-tested in
// isolation: the browser glue (interview-helper settings-sync.test.ts) mocks
// apiFetch with canned responses, and this server's endpoint
// (account.settings.test.ts) is exercised with no client at all. Neither proves
// the two AGREE on the wire shape, so a drift — a renamed key, an extra wrapper
// field, or a lowGfx null/boolean mismatch — would pass both suites yet silently
// drop a player's saved preferences on a real new device.
//
// This test closes that gap. It runs the REAL client functions
// (flushSettingsToServer / hydrateSettingsFromServer from the interview-helper
// package) against the REAL Express handler (mounted via supertest, backed by
// the dev DB). There is NO canned apiFetch mock: the client's apiFetch is
// redirected through supertest so every call actually executes the production
// route. One simulated "device" pushes its local blob; a second, fresh device
// store then hydrates from the account and must end up with the same values —
// proving the { settings, lowGfx } contract round-trips intact end to end.
//
// Notes on the two narrow shims (neither fakes the server contract):
//   • ./api-client is replaced with a TRANSPORT ADAPTER that forwards apiFetch to
//     the real handler over supertest (instead of the browser's fetch + Vite
//     BASE_URL). The response the client sees is the genuine handler output.
//   • ./lowGfx is replaced with a localStorage-faithful stub. The real module
//     imports React (a UI hook) which has no place in a backend test; the stub
//     mirrors exactly the localStorage read/write + change-event behaviour the
//     sync relies on. lowGfx's DOM-class side effects aren't part of the wire
//     contract and are already covered by the client unit suite.
//
// The api-server vitest runs in the "node" environment, so we install a minimal
// localStorage + window (EventTarget) shim the client glue needs.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildApp, actAs, createUser, cleanupTestData } from "./helpers/commsTestApp";

const STORE_KEY = "sm_game_settings_v1";
const LOW_GFX_KEY = "salaryman_low_gfx";

// ── Minimal browser globals the client glue depends on (node env has none) ──
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}
const storage = new MemStorage();
const win = new EventTarget();
(globalThis as unknown as { localStorage: MemStorage }).localStorage = storage;
(globalThis as unknown as { window: EventTarget & { localStorage: MemStorage } }).window =
  Object.assign(win, { localStorage: storage });

// Built once in beforeAll; the apiFetch adapter forwards to this app.
let app: Express;

// In-flight supertest requests started by the client glue. The push path is
// fire-and-forget (pushSettingsToServer does `void apiFetch(...)`), so a test
// awaits `settle()` after a flush to be sure the PUT actually landed.
const pending = new Set<Promise<unknown>>();
async function settle() {
  await Promise.allSettled([...pending]);
}

// Stable spy referenced by the hoisted vi.mock factory; its implementation
// drives a real supertest request against the mounted handler.
const apiFetchSpy = vi.fn((path: string, opts?: { method?: string; body?: string }) => {
  const method = (opts?.method ?? "GET").toUpperCase();
  const body = opts?.body ? JSON.parse(opts.body) : undefined;
  const p = (async () => {
    const r =
      method === "PUT"
        ? await request(app).put(path).send(body)
        : await request(app).get(path).send();
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as unknown as Response;
  })();
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
});

// Redirect the client's apiFetch to the real handler over supertest. NOT a
// canned mock — the response is the genuine route output.
vi.mock("../../../interview-helper/src/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) =>
    apiFetchSpy(...(args as [string, { method?: string; body?: string }?])),
}));

// localStorage-faithful stand-in for lowGfx (real module imports React).
vi.mock("../../../interview-helper/src/lib/lowGfx", () => ({
  isLowGfx: () => {
    try {
      return localStorage.getItem(LOW_GFX_KEY) === "1";
    } catch {
      return false;
    }
  },
  setLowGfx: (on: boolean) => {
    try {
      if (on) localStorage.setItem(LOW_GFX_KEY, "1");
      else localStorage.removeItem(LOW_GFX_KEY);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent("salaryman:lowgfx-changed", { detail: on }));
    } catch {
      /* ignore */
    }
  },
}));

// settings-sync keeps module-level state (the "already started" guard + the
// pending push timer), so each simulated device loads a fresh copy.
async function loadClient() {
  vi.resetModules();
  return import("../../../interview-helper/src/lib/settings-sync");
}

beforeAll(() => {
  app = buildApp();
});
afterAll(async () => {
  await cleanupTestData();
});
beforeEach(() => {
  storage.clear();
});

describe("cross-device settings sync — real client ↔ real handler", () => {
  it("a settings + lowGfx blob pushed by one device re-hydrates intact on a fresh device", async () => {
    const user = await createUser();
    actAs(user);

    // Device A: the player's local display prefs, then push to their account.
    const deviceASettings = { bloom: false, groundGlow: false, cameraZoom: 2.4, master: 0.5 };
    localStorage.setItem(STORE_KEY, JSON.stringify(deviceASettings));
    localStorage.setItem(LOW_GFX_KEY, "1");
    const deviceA = await loadClient();
    deviceA.flushSettingsToServer();
    await settle();

    // Device B: brand-new install — empty local store — signs in and hydrates.
    storage.clear();
    const deviceB = await loadClient();
    await deviceB.hydrateSettingsFromServer();

    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(deviceASettings);
    expect(localStorage.getItem(LOW_GFX_KEY)).toBe("1");
  });

  it("the round-tripped GET shape is exactly { settings, lowGfx } that hydrate destructures", async () => {
    const user = await createUser();
    actAs(user);

    const settings = { nightLighting: true, bloom: false };
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    localStorage.setItem(LOW_GFX_KEY, "1");
    const deviceA = await loadClient();
    deviceA.flushSettingsToServer();
    await settle();

    // Read the stored blob straight from the real handler and assert the wire
    // shape. hydrateSettingsFromServer() reads `data.settings` and `data.lowGfx`
    // off this body, so any wrapper field, renamed key, or lowGfx coerced to
    // null instead of a boolean would silently drop the player's prefs.
    const res = await request(app).get("/api/account/settings").send();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["lowGfx", "settings"]);
    expect(res.body.settings).toEqual(settings);
    expect(res.body.lowGfx).toBe(true); // a real boolean, not null
  });

  it("a fresh device keeps its own local-only keys while adopting the synced ones", async () => {
    const user = await createUser();
    actAs(user);

    // Device A syncs a couple of prefs with low-gfx OFF.
    localStorage.setItem(STORE_KEY, JSON.stringify({ bloom: false, master: 0.3 }));
    const deviceA = await loadClient();
    deviceA.flushSettingsToServer();
    await settle();

    // Device B already has a device-only pref AND low-gfx ON locally.
    storage.clear();
    localStorage.setItem(STORE_KEY, JSON.stringify({ deviceOnly: "keep", bloom: true }));
    localStorage.setItem(LOW_GFX_KEY, "1");
    const deviceB = await loadClient();
    await deviceB.hydrateSettingsFromServer();

    const merged = JSON.parse(localStorage.getItem(STORE_KEY)!);
    expect(merged.bloom).toBe(false); // server wins on a shared key
    expect(merged.master).toBe(0.3); // server-only key adopted
    expect(merged.deviceOnly).toBe("keep"); // local-only key survives
    // Server said low-gfx is off, so the new device clears its local toggle.
    expect(localStorage.getItem(LOW_GFX_KEY)).toBeNull();
  });
});
