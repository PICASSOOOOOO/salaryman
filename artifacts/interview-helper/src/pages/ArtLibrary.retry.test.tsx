// @vitest-environment jsdom
//
// Guards the Art Library downtime-report "Retry failed" button. The server-side
// per-channel retry logic is covered elsewhere; this pins the FRONTEND contract:
//
//   • After a partial send (e.g. Discord delivered, Email failed), a
//     "Retry failed" button appears and clicking it POSTs to
//     /api/art/incident-report with channels === ["email"] ONLY — never the
//     channel that already delivered. This stops a future change from silently
//     re-broadcasting to a channel that already got the report.
//   • The "Retry failed" button is HIDDEN when no channel failed (a clean
//     full success), so there's nothing to retry.
//
// It mounts the real ArtLibrary page with apiFetch mocked, serves a library
// payload with both incident channels configured, and drives the send/retry
// flow through real DOM clicks.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Sequence of /api/art/incident-report responses, consumed in order. Each test
// loads the responses it wants before the click(s) that trigger the POSTs.
let incidentResponses: Array<{ ok: boolean; status: number; body: any }> = [];

// apiFetch double. Serves the library (one provider + both incident channels
// configured) for the mount-time GET, an empty provider list for the poll, and
// pops the next queued response for each incident-report POST.
const apiFetch = vi.fn(async (path: string, opts?: any) => {
  if (path === "/api/art/library") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        configured: true,
        providers: [
          {
            id: "nano-banana",
            label: "Nano Banana",
            description: "Default art backend.",
            configured: true,
            isDefault: true,
            health: "online",
          },
        ],
        polishConfigured: true,
        incidentChannels: { discord: true, email: true, any: true },
        total: 0,
        ready: 0,
        pending: 0,
        failed: 0,
        assets: [],
      }),
    } as unknown as Response;
  }
  if (typeof path === "string" && path.startsWith("/api/art/providers")) {
    return { ok: true, status: 200, json: async () => ({ providers: [], polishConfigured: true }) } as unknown as Response;
  }
  if (path === "/api/art/incident-report" && opts?.method === "POST") {
    const next = incidentResponses.shift() ?? { ok: false, status: 500, body: {} };
    return { ok: next.ok, status: next.status, json: async () => next.body } as unknown as Response;
  }
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
});
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => (apiFetch as any)(...args),
}));

import ArtLibrary from "./ArtLibrary";

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  await act(async () => {
    root.render(<ArtLibrary />);
  });
  await flush();
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

// Find a button whose trimmed text starts with `text`.
function findButton(text: string): HTMLButtonElement | null {
  return (
    (Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").trim().startsWith(text),
    ) as HTMLButtonElement | undefined) ?? null
  );
}

// All POSTs issued to the incident-report route, oldest first.
function incidentPosts() {
  return apiFetch.mock.calls.filter(
    (c: any[]) => c[0] === "/api/art/incident-report" && c[1]?.method === "POST",
  );
}

beforeEach(() => {
  incidentResponses = [];
  apiFetch.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('ArtLibrary "Retry failed" incident button', () => {
  it("after a partial send, retry POSTs ONLY the failed channel", async () => {
    // First send delivers Discord but fails Email; the retry then succeeds.
    incidentResponses = [
      { ok: true, status: 200, body: { delivered: ["discord"], failed: ["email"], skipped: [] } },
      { ok: true, status: 200, body: { delivered: ["email"], failed: [], skipped: [] } },
    ];

    await mount();

    // Initial send goes to BOTH configured channels.
    const sendBtn = findButton("Send report");
    expect(sendBtn, "expected a Send report button").toBeTruthy();
    await click(sendBtn!);

    expect(incidentPosts()).toHaveLength(1);
    expect(JSON.parse(incidentPosts()[0][1].body).channels).toEqual(["discord", "email"]);

    // The partial result surfaces a "Retry failed" button.
    const retryBtn = findButton("Retry failed");
    expect(retryBtn, "expected a Retry failed button after a partial send").toBeTruthy();

    await click(retryBtn!);

    // The retry must target ONLY the channel that failed — never the one that
    // already delivered.
    expect(incidentPosts()).toHaveLength(2);
    expect(JSON.parse(incidentPosts()[1][1].body).channels).toEqual(["email"]);
  });

  it("hides the Retry button when nothing failed (full success)", async () => {
    incidentResponses = [
      { ok: true, status: 200, body: { delivered: ["discord", "email"], failed: [], skipped: [] } },
    ];

    await mount();

    await click(findButton("Send report")!);

    expect(incidentPosts()).toHaveLength(1);
    expect(findButton("Retry failed")).toBeNull();
  });

  it("hides the Retry button after a retry clears the failure", async () => {
    incidentResponses = [
      { ok: true, status: 200, body: { delivered: ["discord"], failed: ["email"], skipped: [] } },
      { ok: true, status: 200, body: { delivered: ["email"], failed: [], skipped: [] } },
    ];

    await mount();

    await click(findButton("Send report")!);
    expect(findButton("Retry failed")).toBeTruthy();

    await click(findButton("Retry failed")!);
    expect(findButton("Retry failed")).toBeNull();
  });
});
