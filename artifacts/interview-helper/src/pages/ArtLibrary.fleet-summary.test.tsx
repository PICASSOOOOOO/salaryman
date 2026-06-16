// @vitest-environment jsdom
//
// Guards the FULL-FLEET backend health summary surfaced directly in the Art
// Library UI (not just inside the copied "Copy all" incident report).
//
// The header used to only emphasize online/offline per chip. The summary now
// renders an aggregate breakdown — online / offline / not configured / unknown —
// using the SAME counting logic and wording as the copied report, so admins get
// the complete picture at a glance during triage without copying anything.
//
// We cover two layers:
//   • the pure helpers (summarizeFleetHealth / buildHealthSummaryParts) that both
//     the on-screen summary and the copied report share, so their wording can't
//     drift apart
//   • the rendered summary, mounting the real ArtLibrary against a mocked
//     /api/art/library and asserting the aggregate chips appear on screen
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary, {
  summarizeFleetHealth,
  buildHealthSummaryParts,
} from "./ArtLibrary";

function json(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
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

describe("summarizeFleetHealth (shared full-fleet tally)", () => {
  it("counts every backend by derived health, folding checking into unknown", () => {
    const summary = summarizeFleetHealth([
      { id: "a", label: "A", configured: true, health: "online", healthHistory: [] },
      { id: "b", label: "B", configured: true, health: "offline", healthHistory: [] },
      { id: "c", label: "C", configured: false, health: "not-configured", healthHistory: [] },
      { id: "d", label: "D", configured: true, health: "checking", healthHistory: [] },
      { id: "e", label: "E", configured: true, healthHistory: [] }, // no health → unknown
    ] as any);
    expect(summary).toEqual({ online: 1, offline: 1, notConfigured: 1, unknown: 2 });
  });

  it("derives not-configured from configured:false when health is absent", () => {
    const summary = summarizeFleetHealth([
      { id: "a", label: "A", configured: false, healthHistory: [] },
    ] as any);
    expect(summary).toEqual({ online: 0, offline: 0, notConfigured: 1, unknown: 0 });
  });
});

describe("buildHealthSummaryParts (wording shared with the copied report)", () => {
  it("always shows online/offline and adds not-configured/unknown only when present", () => {
    expect(buildHealthSummaryParts({ online: 2, offline: 1, notConfigured: 1, unknown: 1 })).toEqual([
      "2 online",
      "1 offline",
      "1 not configured",
      "1 unknown",
    ]);
  });

  it("omits the not-configured and unknown segments when there are none", () => {
    expect(buildHealthSummaryParts({ online: 1, offline: 1, notConfigured: 0, unknown: 0 })).toEqual([
      "1 online",
      "1 offline",
    ]);
  });
});

describe("Art Library: on-screen full-fleet summary", () => {
  let root: Root;
  let container: HTMLDivElement;

  async function renderWith(providers: any[]) {
    h.apiFetch.mockReset();
    h.apiFetch.mockImplementation((url: string) => {
      if (url.includes("/art/library")) return json(libraryBody(providers));
      if (url.includes("/art/providers"))
        return json({ providers, polishConfigured: false });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    await act(async () => {
      root.render(<ArtLibrary />);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the full breakdown including not-configured and unknown", async () => {
    await renderWith([
      { id: "a", label: "A", configured: true, health: "online", healthHistory: [] },
      { id: "b", label: "B", configured: true, health: "offline", healthHistory: [] },
      { id: "c", label: "C", configured: false, health: "not-configured", healthHistory: [] },
      { id: "d", label: "D", configured: true, health: "checking", healthHistory: [] },
    ]);
    const txt = container.textContent ?? "";
    expect(txt).toContain("1 online");
    expect(txt).toContain("1 offline");
    expect(txt).toContain("1 not configured");
    expect(txt).toContain("1 unknown");
  });

  it("still shows online/offline even when no backend is not-configured or unknown", async () => {
    await renderWith([
      { id: "a", label: "A", configured: true, health: "online", healthHistory: [] },
      { id: "b", label: "B", configured: true, health: "offline", healthHistory: [] },
    ]);
    const txt = container.textContent ?? "";
    expect(txt).toContain("1 online");
    expect(txt).toContain("1 offline");
  });
});
