// @vitest-environment jsdom
//
// Guards that WorldMapPanel's collector-threat panel reacts immediately to
// wanted-level changes without waiting for the 1-second poll.
//
// The fix dispatches a custom `sm_wanted_changed` window event from doSave so
// WorldMapPanel refreshes in the same tab instantly. A `storage` event (the
// cross-tab path) must also trigger the same refresh. These tests pin both
// paths so a regression that silently reverts the fix is caught.
//
// Contract:
//   1. On mount with wantedLevel=0, the threat panel is absent from the DOM.
//   2. After dispatching `sm_wanted_changed`, the panel appears immediately
//      (within the same act() call — no timer advance needed).
//   3. The panel reflects the updated wantedLevel label and bounty figure.
//   4. The `storage` event fires the same refresh path (cross-tab safety net).
//   5. A second `sm_wanted_changed` dispatch can UPDATE the panel to a new
//      wantedLevel without the 1s poll.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Hoisted mock state ────────────────────────────────────────────────────────
// readBoCollectorsFromSave is hoisted so we can swap its return value between
// test assertions without remounting the component.
const h = vi.hoisted(() => ({
  readFn: vi.fn(),
}));

vi.mock("@/lib/world-map-collectors", () => ({
  readBoCollectorsFromSave: h.readFn,
}));

// Authenticated so the component renders the full map (not a sign-in prompt).
vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false],
}));

// apiFetch: serve empty responses so async fetches don't throw.
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ players: [], online: 0, max: 100, listings: [] }),
  })),
}));

// framer-motion: render motion.div/svg as plain elements, drop animation props.
vi.mock("framer-motion", async () => {
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_t, tag: string) =>
      ({ children, animate, initial, transition, whileHover, ...rest }: any) =>
        createElement(
          tag === "svg" ? "svg" : tag === "circle" ? "circle" : "div",
          rest,
          children,
        ),
  });
  return { motion, AnimatePresence: ({ children }: any) => children };
});

// MapChrome: return stubs — we only care about the threat panel, but
// LANDMARK_GUIDE must be a proper Record so WorldMapPanel's SVG landmark
// loop doesn't crash accessing guide.color on undefined.
vi.mock("@/components/MapChrome", () => {
  const stub = { icon: "📍", tag: "PLACE", color: "#ffffff" };
  return {
    CompassRose: () => null,
    PamphletBanner: () => null,
    LANDMARK_GUIDE: new Proxy({} as Record<string, typeof stub>, {
      get: () => stub,
    }),
  };
});

// resolveAvatarUrl: identity stub (no network).
vi.mock("@/lib/avatar", () => ({
  resolveAvatarUrl: (url: string | null) => url ?? "",
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRead(
  wantedLevel: number,
  bountyAmount = 0,
  boWaveCount = 0,
  collectors: { x: number; y: number }[] = [],
) {
  return { collectors, wantedLevel, bountyAmount, boWaveCount };
}

function dispatchWantedChanged() {
  window.dispatchEvent(new Event("sm_wanted_changed"));
}

function dispatchStorage() {
  window.dispatchEvent(new Event("storage"));
}

// ── Test lifecycle ─────────────────────────────────────────────────────────────

let root: Root;
let container: HTMLDivElement;

// Deferred import so mocks are in place before the module resolves.
let WorldMapPanel: React.ComponentType;

beforeEach(async () => {
  localStorage.clear();
  h.readFn.mockReset();
  // Default: no threat active.
  h.readFn.mockReturnValue(makeRead(0));

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  // Import (or re-use) the component after mocks are wired.
  WorldMapPanel = (await import("./WorldMapPanel")).default;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

function text(): string {
  return container.textContent ?? "";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorldMapPanel — sm_wanted_changed event (same-tab live refresh)", () => {
  it("shows no threat panel on mount when wantedLevel is 0", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    // Flush async fetches.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(text()).not.toMatch(/FIRST NOTICE|SECOND NOTICE|FINAL NOTICE/);
  });

  it("shows FIRST NOTICE immediately after sm_wanted_changed raises wantedLevel to 1", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Simulate doSave writing a wantedLevel=1 update then firing the event.
    h.readFn.mockReturnValue(makeRead(1, 1200, 1));
    await act(async () => {
      dispatchWantedChanged();
    });

    expect(text()).toContain("FIRST NOTICE");
    // Bounty amount is formatted and displayed.
    expect(text()).toContain("ƒ1,200");
  });

  it("shows SECOND NOTICE for wantedLevel=2 dispatched via sm_wanted_changed", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });

    h.readFn.mockReturnValue(makeRead(2, 5000, 2));
    await act(async () => {
      dispatchWantedChanged();
    });

    expect(text()).toContain("SECOND NOTICE");
    expect(text()).toContain("ƒ5,000");
  });

  it("shows FINAL NOTICE for wantedLevel=3 dispatched via sm_wanted_changed", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });

    h.readFn.mockReturnValue(makeRead(3, 25000, 3));
    await act(async () => {
      dispatchWantedChanged();
    });

    expect(text()).toContain("FINAL NOTICE");
    expect(text()).toContain("ƒ25,000");
  });

  it("updates the panel when a second sm_wanted_changed escalates the level", async () => {
    // Start at level 1.
    h.readFn.mockReturnValue(makeRead(1, 1000, 1));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain("FIRST NOTICE");

    // Escalate to level 2 via a second event — no timer advance.
    h.readFn.mockReturnValue(makeRead(2, 7500, 2));
    await act(async () => {
      dispatchWantedChanged();
    });

    expect(text()).toContain("SECOND NOTICE");
    expect(text()).toContain("ƒ7,500");
    expect(text()).not.toContain("FIRST NOTICE");
  });

  it("hides the panel immediately when wantedLevel drops back to 0 via sm_wanted_changed", async () => {
    // Start with an active threat.
    h.readFn.mockReturnValue(makeRead(1, 3000, 1));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain("FIRST NOTICE");

    // Threat cleared (e.g. player paid off the debt).
    h.readFn.mockReturnValue(makeRead(0, 0, 0));
    await act(async () => {
      dispatchWantedChanged();
    });

    expect(text()).not.toMatch(/FIRST NOTICE|SECOND NOTICE|FINAL NOTICE/);
  });
});

describe("WorldMapPanel — storage event (cross-tab safety net)", () => {
  it("shows the threat panel immediately after a storage event raises wantedLevel", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).not.toMatch(/FIRST NOTICE|SECOND NOTICE|FINAL NOTICE/);

    // Another tab wrote to localStorage and the browser fired a storage event.
    h.readFn.mockReturnValue(makeRead(2, 9999, 2));
    await act(async () => {
      dispatchStorage();
    });

    expect(text()).toContain("SECOND NOTICE");
    expect(text()).toContain("ƒ9,999");
  });

  it("hides the threat panel when a storage event clears wantedLevel", async () => {
    h.readFn.mockReturnValue(makeRead(1, 500, 1));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain("FIRST NOTICE");

    h.readFn.mockReturnValue(makeRead(0, 0, 0));
    await act(async () => {
      dispatchStorage();
    });

    expect(text()).not.toMatch(/FIRST NOTICE|SECOND NOTICE|FINAL NOTICE/);
  });
});

describe("WorldMapPanel — event listener cleanup", () => {
  it("does not update state after unmount when sm_wanted_changed fires", async () => {
    h.readFn.mockReturnValue(makeRead(0));
    await act(async () => {
      root.render(createElement(WorldMapPanel));
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Unmount the component — the useEffect cleanup must remove the listener.
    await act(async () => {
      root.unmount();
    });

    // Firing the event after unmount should not throw or warn.
    h.readFn.mockReturnValue(makeRead(3, 99999, 3));
    expect(() => {
      dispatchWantedChanged();
    }).not.toThrow();
  });
});
