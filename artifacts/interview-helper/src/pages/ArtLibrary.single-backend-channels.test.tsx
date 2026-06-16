// @vitest-environment jsdom
//
// Guards the per-backend "send" button in the Art Library backend-health panel.
//
// The single-backend send (sendHistory) forwards the admin's Discord/email
// channel picker (selectedChannels) to POST /api/art/incident-report, exactly
// like the all-backends "Send report" (sendIncidentReport). Without coverage, a
// regression could drop the `channels` filter and silently re-spam EVERY
// configured channel for a one-backend alert.
//
// We mount the real ArtLibrary against a mocked /api/art/incident-report and
// assert, for the per-backend send:
//   • it posts { text, channels: [...] } matching the selected channels
//   • picking a SINGLE channel routes the alert to ONLY that channel
//   • it posts NOTHING when no channel is selected (button disabled / early return)
//   • parity: the all-backends "Send report" posts the same channel filter
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));

import ArtLibrary, { buildHistoryCopyText } from "./ArtLibrary";

function json(body: any, init?: { ok?: boolean; status?: number }) {
  return Promise.resolve({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  });
}

const NOW = 1_700_000_000_000;

// A backend with two transitions so the history list (which slices off the
// current run) is non-empty and the per-backend send button renders.
const PROVIDER = {
  id: "nano-banana",
  label: "Nano Banana",
  description: "Default art backend",
  configured: true,
  isDefault: true,
  health: "offline",
  healthHistory: [
    { at: NOW, health: "offline" },
    { at: NOW - 60_000, health: "online" },
  ],
};

// The recent transitions the panel shows (current run excluded) — the exact
// slice sendHistory dumps via buildHistoryCopyText.
const HISTORY = PROVIDER.healthHistory.slice(1);
const EXPECTED_TEXT = buildHistoryCopyText(PROVIDER.label, HISTORY as any);

function libraryBody(incidentChannels: Record<string, boolean>) {
  return {
    configured: true,
    providers: [PROVIDER],
    polishConfigured: false,
    incidentChannels: { any: Boolean(incidentChannels.discord || incidentChannels.email), ...incidentChannels },
    total: 0,
    ready: 0,
    pending: 0,
    failed: 0,
    assets: [],
  };
}

describe("Art Library: single-backend send honours the channel picker", () => {
  let root: Root;
  let container: HTMLDivElement;

  async function mount(incidentChannels: Record<string, boolean>) {
    h.apiFetch.mockReset();
    h.apiFetch.mockImplementation((url: string) => {
      if (url.includes("/art/library")) return json(libraryBody(incidentChannels));
      if (url.includes("/art/providers"))
        return json({ providers: [PROVIDER], polishConfigured: false });
      if (url.includes("/art/incident-report"))
        return json({ delivered: ["discord", "email"], failed: [], skipped: [] });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    await act(async () => { root.render(<ArtLibrary />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }

  // Find a button by exact (trimmed) visible text.
  function btnByText(text: string) {
    return Array.from(container.querySelectorAll("button")).find(
      b => (b.textContent ?? "").trim() === text,
    );
  }

  // The per-backend send button — identified by either of its two titles
  // (the active "Send this backend's…" or the disabled "Pick at least one…").
  function perBackendSend() {
    return Array.from(container.querySelectorAll("button")).find(b => {
      const t = b.getAttribute("title") ?? "";
      return t.includes("Send this backend") || t.includes("Pick at least one destination");
    });
  }

  // Expand the backend's history log so the per-backend send button renders.
  function expandHistory() {
    const toggle = Array.from(container.querySelectorAll("button")).find(b =>
      /^log·/.test((b.textContent ?? "").trim()),
    );
    if (!toggle) throw new Error("history toggle (log·N) not found");
    return toggle;
  }

  // All POST bodies sent to /api/art/incident-report.
  function incidentPosts() {
    return h.apiFetch.mock.calls
      .filter(([url]) => typeof url === "string" && url.includes("/art/incident-report"))
      .map(([, opts]) => JSON.parse((opts as any).body));
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

  it("posts { text, channels } with BOTH selected channels by default", async () => {
    await mount({ discord: true, email: true });
    await act(async () => { expandHistory().click(); });
    await act(async () => { perBackendSend()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const posts = incidentPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual({ text: EXPECTED_TEXT, channels: ["discord", "email"] });
  });

  it("routes to ONLY the chosen channel when one is deselected", async () => {
    await mount({ discord: true, email: true });
    // Deselect Email so just Discord remains selected.
    await act(async () => { btnByText("Email")!.click(); });
    await act(async () => { expandHistory().click(); });
    await act(async () => { perBackendSend()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const posts = incidentPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].channels).toEqual(["discord"]);
    expect(posts[0].channels).not.toContain("email");
    expect(posts[0].text).toBe(EXPECTED_TEXT);
  });

  it("posts nothing (button disabled / early return) when no channel is selected", async () => {
    await mount({ discord: true, email: true });
    // Deselect BOTH channels.
    await act(async () => { btnByText("Discord")!.click(); });
    await act(async () => { btnByText("Email")!.click(); });
    await act(async () => { expandHistory().click(); });

    const send = perBackendSend()!;
    expect(send.hasAttribute("disabled")).toBe(true);
    // Clicking a disabled button is a no-op; assert no incident-report fires.
    await act(async () => { send.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(incidentPosts()).toHaveLength(0);
  });

  it("only the configured channel is selectable when one is unconfigured", async () => {
    // Email not configured on the server → it can't be selected, so a send
    // routes to Discord alone.
    await mount({ discord: true, email: false });
    await act(async () => { expandHistory().click(); });
    await act(async () => { perBackendSend()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const posts = incidentPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].channels).toEqual(["discord"]);
  });

  it("parity: the all-backends 'Send report' posts the same channel filter", async () => {
    await mount({ discord: true, email: true });
    // Deselect Email → both the all-backends and per-backend sends should now
    // target Discord only (shared selectedChannels state).
    await act(async () => { btnByText("Email")!.click(); });

    const sendReport = btnByText("Send report")!;
    await act(async () => { sendReport.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const posts = incidentPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].channels).toEqual(["discord"]);
  });
});
