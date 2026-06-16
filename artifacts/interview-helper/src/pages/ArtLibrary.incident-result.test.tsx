// @vitest-environment jsdom
//
// Guards the per-channel incident-report result breakdown surfaced after an admin
// hits "Send report" in the Art Library.
//
// The result used to be a single fading one-liner ("Sent (discord + email)").
// It now reads the delivered / failed / skipped arrays the server already returns
// and renders a persistent breakdown so a PARTIAL failure (one channel delivered,
// one failed/skipped) is visually distinct from a full success and a full
// failure, and stays visible long enough to read.
//
// We cover two layers:
//   • the pure classifier (classifyIncidentDelivery) that maps the three arrays
//     to success / partial / failed
//   • the rendered breakdown, mounting the real ArtLibrary against a mocked
//     /api/art/incident-report and asserting the per-channel chips appear
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary, { classifyIncidentDelivery } from "./ArtLibrary";

function json(body: any, init?: { ok?: boolean; status?: number }) {
  return Promise.resolve({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  });
}

function libraryBody(extra?: Record<string, unknown>) {
  return {
    configured: true,
    providers: [
      { id: "nano-banana", label: "Nano Banana", configured: true, health: "offline", healthHistory: [] },
    ],
    polishConfigured: false,
    // Both channels configured so the picker selects both by default.
    incidentChannels: { discord: true, email: true, any: true },
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    assets: [],
    ...extra,
  };
}

describe("classifyIncidentDelivery (pure outcome mapping)", () => {
  it("is a full success when everything delivered and nothing failed/skipped", () => {
    expect(classifyIncidentDelivery(["discord", "email"], [], [])).toBe("success");
  });

  it("is partial when some delivered but a channel failed", () => {
    expect(classifyIncidentDelivery(["discord"], ["email"], [])).toBe("partial");
  });

  it("is partial when some delivered but a channel was skipped (not configured)", () => {
    expect(classifyIncidentDelivery(["discord"], [], ["email"])).toBe("partial");
  });

  it("is a full failure when nothing delivered", () => {
    expect(classifyIncidentDelivery([], ["discord", "email"], [])).toBe("failed");
    expect(classifyIncidentDelivery([], [], ["discord"])).toBe("failed");
  });
});

describe("Art Library: incident-report result breakdown", () => {
  let root: Root;
  let container: HTMLDivElement;

  async function mount(
    incidentResponse: any,
    init?: { ok?: boolean; status?: number; throws?: boolean },
  ) {
    h.apiFetch.mockReset();
    h.apiFetch.mockImplementation((url: string) => {
      if (url.includes("/art/library")) return json(libraryBody());
      if (url.includes("/art/providers"))
        return json({ providers: libraryBody().providers, polishConfigured: false });
      if (url.includes("/art/incident-report")) {
        if (init?.throws) return Promise.reject(new Error("network down"));
        return json(incidentResponse, init);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    await act(async () => { root.render(<ArtLibrary />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  function clickSend() {
    const btn = Array.from(container.querySelectorAll("button")).find(b =>
      (b.textContent ?? "").includes("Send report"),
    );
    if (!btn) throw new Error("Send report button not found");
    return btn;
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

  it("shows a partial result with delivered AND failed channels distinctly", async () => {
    await mount({ ok: true, delivered: ["discord"], failed: ["email"], skipped: [] });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Partially delivered");
    expect(txt).toContain("Discord delivered");
    expect(txt).toContain("Email failed");
  });

  it("labels a skipped (not configured) channel distinctly from a failure", async () => {
    await mount({ ok: true, delivered: ["discord"], failed: [], skipped: ["email"] });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Partially delivered");
    expect(txt).toContain("Discord delivered");
    expect(txt).toContain("Email skipped");
  });

  it("shows a clean full-success result", async () => {
    await mount({ ok: true, delivered: ["discord", "email"], failed: [], skipped: [] });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Report delivered");
    expect(txt).toContain("Discord delivered");
    expect(txt).toContain("Email delivered");
  });

  it("shows a full failure when the 502 breakdown has nothing delivered", async () => {
    await mount(
      { error: "Failed to deliver report", delivered: [], failed: ["discord", "email"], skipped: [] },
      { ok: false, status: 502 },
    );
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Delivery failed");
    expect(txt).toContain("Discord failed");
    expect(txt).toContain("Email failed");
  });

  // The 503 / 409 responses carry NO per-channel breakdown, so they surface as a
  // red 'error' panel whose label IS the human message (not a generic "failed").
  it("shows 'No incident channel configured' on a 503 with no breakdown", async () => {
    await mount({ error: "no incident channel configured" }, { ok: false, status: 503 });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("No incident channel configured");
    // No breakdown chips for an error outcome.
    expect(txt).not.toContain("Discord delivered");
    expect(txt).not.toContain("Discord failed");
  });

  it("shows 'Already sent moments ago' on a 409 deduped response", async () => {
    await mount({ deduped: true }, { ok: false, status: 409 });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Already sent moments ago");
    expect(txt).not.toContain("Discord delivered");
    expect(txt).not.toContain("Discord failed");
  });

  it("shows 'Send failed' when the request throws (network error)", async () => {
    await mount(null, { throws: true });
    await act(async () => { clickSend().click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const txt = container.textContent ?? "";
    expect(txt).toContain("Send failed");
    expect(txt).not.toContain("Discord delivered");
    expect(txt).not.toContain("Discord failed");
  });
});
