// @vitest-environment jsdom
//
// Guards the dynamic feature label that names the live-session area
// "Classroom" for education orgs and "Conference" for everyone else.
//
// Contract (GET /api/education/label):
//   - non-education org / logged-out: label === "Conference" (the default)
//   - education org: label === "Classroom"
//   - a transient failure (non-ok / network) returns the Conference default for
//     THAT call but is NOT memoized, so a later mount retries and can still
//     resolve "Classroom" once the backend recovers.
//
// The hook keeps a module-level cache shared across every nav surface and the
// command palette, so each case re-imports it fresh via vi.resetModules.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

function ok(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}
function fail() {
  return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
}

let root: Root;
let container: HTMLDivElement;
let label = "";

// Render-to-null harness: a tiny component publishes the hook's label into the
// `label` closure var so assertions can read it without touching the DOM.
async function mount() {
  const { useFeatureLabel } = await import("./use-feature-label");
  function Probe() {
    label = useFeatureLabel().label;
    return null;
  }
  await act(async () => {
    root.render(<Probe />);
  });
  // Flush the apiFetch -> json() microtask chain.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.resetModules(); // drop the hook's module-level cache between cases
  h.apiFetch.mockReset();
  label = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useFeatureLabel", () => {
  it("defaults to Conference for a non-education org", async () => {
    h.apiFetch.mockImplementation(() => ok({ label: "Conference", isEducation: false }));
    await mount();
    expect(label).toBe("Conference");
  });

  it("shows Classroom for an education org", async () => {
    h.apiFetch.mockImplementation(() => ok({ label: "Classroom", isEducation: true }));
    await mount();
    expect(label).toBe("Classroom");
  });

  it("falls back to Conference on a transient failure WITHOUT caching it", async () => {
    // First call fails -> Conference fallback, must not be memoized.
    h.apiFetch.mockImplementationOnce(() => fail());
    await mount();
    expect(label).toBe("Conference");

    act(() => root.unmount());

    // Backend recovers; a fresh mount must re-fetch and resolve Classroom
    // rather than serving a cached fallback.
    h.apiFetch.mockImplementation(() => ok({ label: "Classroom", isEducation: true }));
    root = createRoot(container);
    await act(async () => {
      const { useFeatureLabel } = await import("./use-feature-label");
      function Probe() { label = useFeatureLabel().label; return null; }
      root.render(<Probe />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(label).toBe("Classroom");
  });
});
