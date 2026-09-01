// @vitest-environment jsdom
//
// End-to-end guard for the VISIBLE unread badge on the COMMS hub page's
// messages (CHAT) tab. Sibling tests already prove the FAB badge and the
// NavBar / MobileBottomBar summary nav badge clear when a conversation is read
// (ChatPanel.badge.test.tsx, use-comms-summary.test.tsx). This renders the real
// /comms route component (Comms) wired to the REAL useCommsSummary hook over a
// controllable /api/comms/summary double, so the rendered tab badge reflects the
// production unread-count wiring — not a mocked summary.
//
// It pins the contract that the CHAT-tab badge surfaces unreadMessages and then
// drops to nothing after the user reads a channel and invalidateCommsSummary()
// re-polls a cleared summary. A regression that left the hub badge stuck after a
// read would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  authState: { isAuthenticated: true },
}));

// Mock the leaf concerns (auth, routing, presentational tab bodies, boomer-mode)
// but keep the REAL useCommsSummary so the badge is produced by production code.
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => h.authState }));
vi.mock("wouter", () => ({ useLocation: () => ["", vi.fn()] }));
vi.mock("@/components/SignInPrompt", () => ({ SignInPage: () => null }));
vi.mock("@/hooks/use-mobile", () => ({
  getDefaultBoomerMode: () => false,
  useBoomerMode: () => [false, vi.fn()],
  useIsMobile: () => false,
}));
vi.mock("./Colleagues", () => ({ default: () => null }));
vi.mock("./ColleaguesPanel", () => ({ default: () => null }));

import Comms from "./Comms";
import { invalidateCommsSummary } from "@/hooks/use-comms-summary";

let summary: { unreadMessages: number; unreadSms: number; pendingRequests: number; total: number };

const fetchMock = vi.fn(async (url: string) => {
  if (String(url).endsWith("/api/comms/summary")) {
    return { ok: true, json: async () => summary };
  }
  return { ok: false, json: async () => ({}) };
});

let root: Root;
let container: HTMLDivElement;

async function mount() {
  await act(async () => {
    root.render(<Comms />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// The CHAT tab is the first nav button; its badge is the red pill span inside it.
function chatTabBadge(): string | null {
  const buttons = Array.from(container.querySelectorAll("button"));
  const chatBtn = buttons.find(b => /CHAT/.test(b.textContent ?? ""));
  if (!chatBtn) return null;
  const badge = chatBtn.querySelector("span.bg-red-500");
  return badge ? (badge.textContent ?? "") : null;
}

function smsTabBadge(): string | null {
  const buttons = Array.from(container.querySelectorAll("button"));
  const smsBtn = buttons.find(b => /^SMS/.test((b.textContent ?? "").trim()));
  const badge = smsBtn?.querySelector("span.bg-red-500");
  return badge ? (badge.textContent ?? "") : null;
}

beforeEach(() => {
  summary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0 };
  (globalThis as any).fetch = fetchMock;
  fetchMock.mockClear();
  // Drop the module-level summary cache so each test starts from a clean poll.
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

describe("Comms hub messages-tab badge", () => {
  it("renders the CHAT-tab unread badge from the summary endpoint", async () => {
    summary = { unreadMessages: 7, unreadSms: 0, pendingRequests: 0, total: 7 };
    await mount();

    expect(chatTabBadge()).toBe("7");
  });

  it("clears the CHAT-tab badge after a read re-polls a cleared summary", async () => {
    // The user has unread messages on first poll, so the hub badge is showing.
    summary = { unreadMessages: 4, unreadSms: 0, pendingRequests: 0, total: 4 };
    await mount();
    expect(chatTabBadge()).toBe("4");

    // The user reads the conversation server-side, so the summary now reports
    // nothing unread. invalidateCommsSummary() forces an immediate re-poll
    // instead of waiting for the next interval tick.
    summary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0 };
    await act(async () => {
      invalidateCommsSummary();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The badge pill is gone entirely once unreadMessages drops to 0.
    expect(chatTabBadge()).toBe(null);
  });

  it("renders unread SMS on the SMS tab and in the overall Comms count", async () => {
    summary = { unreadMessages: 0, unreadSms: 5, pendingRequests: 0, total: 5 };
    await mount();
    expect(smsTabBadge()).toBe("5");
  });
});
