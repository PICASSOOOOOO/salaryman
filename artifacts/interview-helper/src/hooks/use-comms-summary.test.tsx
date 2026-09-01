// @vitest-environment jsdom
//
// Guards the COMMS summary badge surface produced by the REAL useCommsSummary
// hook (unreadMessages + total — read by the Comms hub tab badge and the
// NavBar / MobileBottomBar nav badge). The ChatPanel notify tests mock this
// hook out, so a regression that stopped the polled summary from surfacing
// unreadMessages would slip past them. This drives the live hook against a
// stubbed /api/comms/summary response and asserts the badge fields climb.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  authState: { isAuthenticated: true },
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => h.authState }));

import { useCommsSummary, invalidateCommsSummary } from "./use-comms-summary";

let summary: { unreadMessages: number; unreadSms: number; pendingRequests: number; total: number };

const fetchMock = vi.fn(async (url: string) => {
  if (String(url).endsWith("/api/comms/summary")) {
    return { ok: true, json: async () => summary };
  }
  return { ok: false, json: async () => ({}) };
});

let captured: ReturnType<typeof useCommsSummary> | null = null;
function Capture() {
  captured = useCommsSummary();
  return null;
}

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<Capture />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  captured = null;
  summary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0 };
  (globalThis as any).fetch = fetchMock;
  fetchMock.mockClear();
  // Drop the module-level cache so each test starts from a clean poll.
  invalidateCommsSummary();
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

describe("useCommsSummary unread badge wiring", () => {
  it("surfaces unreadMessages and total from the summary endpoint", async () => {
    summary = { unreadMessages: 3, unreadSms: 0, pendingRequests: 1, total: 4 };
    await mount();

    expect(captured!.unreadMessages).toBe(3);
    expect(captured!.total).toBe(4);
    expect(captured!.loading).toBe(false);
  });

  it("re-fetches and climbs the badge when invalidated", async () => {
    summary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0 };
    await mount();
    expect(captured!.unreadMessages).toBe(0);

    // A new message lands server-side; an invalidate triggers a re-poll.
    summary = { unreadMessages: 2, unreadSms: 0, pendingRequests: 0, total: 2 };
    await act(async () => {
      invalidateCommsSummary();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured!.unreadMessages).toBe(2);
    expect(captured!.total).toBe(2);
  });

  it("re-fetches and clears the badge when invalidated after a read", async () => {
    // The user has unread messages on first poll.
    summary = { unreadMessages: 5, unreadSms: 0, pendingRequests: 0, total: 5 };
    await mount();
    expect(captured!.unreadMessages).toBe(5);
    expect(captured!.total).toBe(5);

    // The user reads the conversation server-side, so the summary now reports
    // nothing unread. invalidateCommsSummary() forces an immediate re-poll
    // instead of waiting up to 30s for the next interval tick.
    summary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0 };
    await act(async () => {
      invalidateCommsSummary();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured!.unreadMessages).toBe(0);
    expect(captured!.total).toBe(0);
  });
});
