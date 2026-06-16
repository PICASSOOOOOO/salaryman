// @vitest-environment jsdom
//
// Guards the backend status-chip "last changed / checked Ns ago" indicator and
// the online<->offline flash in the Art Library.
//
// Contract:
//   relativeDuration(ms):
//     - clamps negatives to 0s, rounds to whole seconds
//     - crosses to m / h / d at the 60s / 60m / 24h boundaries
//   chip behavior across provider polls:
//     - first sight of a provider: shows "checked Ns ago", never flashes and
//       never shows "changed" (we have no prior health to compare against)
//     - a poll whose health is unchanged: still "checked", no flash
//     - a poll whose health actually flips (online<->offline): switches to
//       "changed Ns ago" AND flashes a transition ring
//
// ArtLibrary loads /api/art/library on mount (first poll) and re-polls
// /api/art/providers when the tab becomes visible; we drive both via a mocked
// apiFetch and fire `visibilitychange` to deliver the second poll.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  // Providers returned by the NEXT /api/art/providers poll.
  nextProviders: [] as any[],
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary, { relativeDuration } from "./ArtLibrary";

function json(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function provider(over: Partial<any> = {}) {
  return {
    id: "nano-banana",
    label: "Nano Banana",
    description: "default backend",
    configured: true,
    isDefault: true,
    health: "online",
    lastError: null,
    ...over,
  };
}

function libraryBody(providers: any[]) {
  return {
    configured: true,
    providers,
    polishConfigured: false,
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    assets: [],
  };
}

let root: Root;
let container: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(<ArtLibrary />);
  });
  // Flush the microtasks queued by the async apiFetch -> json() chain.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// Drive a second provider poll: ArtLibrary's visibility handler calls
// refreshProviders() whenever the tab becomes visible.
async function poll() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function chipText(): string {
  return container.textContent ?? "";
}

function isFlashing(): boolean {
  // The transition ring uses ring-2 ring-<color>-400/70 utility classes.
  return /ring-2\s+ring-(emerald|red|fuchsia)-400/.test(container.innerHTML);
}

beforeEach(() => {
  h.nextProviders = [];
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation((url: string) => {
    if (url.includes("/art/library")) return json(libraryBody([provider()]));
    if (url.includes("/art/providers"))
      return json({ providers: h.nextProviders, polishConfigured: false });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("relativeDuration", () => {
  it("clamps negative input to 0s", () => {
    expect(relativeDuration(-5000)).toBe("0s");
  });

  it("rounds milliseconds to whole seconds below a minute", () => {
    expect(relativeDuration(0)).toBe("0s");
    expect(relativeDuration(5_000)).toBe("5s");
    expect(relativeDuration(5_400)).toBe("5s");
    expect(relativeDuration(5_600)).toBe("6s");
    expect(relativeDuration(59_000)).toBe("59s");
  });

  it("crosses to minutes at the 60s boundary", () => {
    expect(relativeDuration(60_000)).toBe("1m");
    expect(relativeDuration(90_000)).toBe("1m");
    expect(relativeDuration(59 * 60_000)).toBe("59m");
  });

  it("crosses to hours at the 60m boundary", () => {
    expect(relativeDuration(60 * 60_000)).toBe("1h");
    expect(relativeDuration(23 * 60 * 60_000)).toBe("23h");
  });

  it("crosses to days at the 24h boundary", () => {
    expect(relativeDuration(24 * 60 * 60_000)).toBe("1d");
    expect(relativeDuration(3 * 24 * 60 * 60_000)).toBe("3d");
  });
});

describe("status chip transition + flash", () => {
  it("shows 'checked … ago' and does NOT flash on first sight", async () => {
    await render();

    expect(chipText()).toMatch(/checked \d+s ago/);
    expect(chipText()).not.toMatch(/changed/);
    expect(isFlashing()).toBe(false);
  });

  it("does NOT flash or switch to 'changed' when health is unchanged", async () => {
    await render(); // first sight: online

    h.nextProviders = [provider({ health: "online" })]; // same health
    await poll();

    expect(chipText()).toMatch(/checked \d+s ago/);
    expect(chipText()).not.toMatch(/changed/);
    expect(isFlashing()).toBe(false);
  });

  it("flashes a transition ring on a real online->offline flip", async () => {
    await render(); // first sight: online

    // Server now drives the wording off lastChangedAt: an offline flip reads
    // "down … ago" (see ArtLibrary.uptime-chip.test.tsx). The flash ring is the
    // poll-driven transition cue and fires regardless.
    h.nextProviders = [provider({ health: "offline", lastChangedAt: Date.now() })];
    await poll();

    expect(chipText()).toMatch(/down \d+s ago/);
    expect(chipText()).not.toMatch(/checked/);
    expect(isFlashing()).toBe(true);
  });

  it("flashes again on a subsequent offline->online flip", async () => {
    await render(); // online

    h.nextProviders = [provider({ health: "offline", lastChangedAt: Date.now() })];
    await poll(); // -> down, flashing
    expect(isFlashing()).toBe(true);

    h.nextProviders = [provider({ health: "online", lastChangedAt: Date.now() })];
    await poll(); // flips back -> up, flashing again
    expect(chipText()).toMatch(/up \d+s ago/);
    expect(isFlashing()).toBe(true);
  });
});
