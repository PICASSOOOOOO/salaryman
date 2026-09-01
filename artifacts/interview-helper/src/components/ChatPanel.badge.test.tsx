// @vitest-environment jsdom
//
// End-to-end guard for the VISIBLE unread badge on the COMMS FAB. Unlike
// ChatPanel.notify.test.tsx — which mocks useChatSocket out and only asserts
// the toast/chime behaviour — this renders the real ChatPanel wired to the
// real useChatSocket hook (over a controllable WebSocket double) so the rendered
// badge text reflects the actual unread-count wiring.
//
// Crucially it pins the contract that the badge climbs whether comms pop-up
// alerts are ON or OFF: the alerts preference only gates the toast/chime, never
// the unread badge. A regression that suppressed the badge alongside the toast
// when alerts are off would be caught here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  authState: {
    user: { id: "me", firstName: "Me", lastName: "User", email: "me@example.com" },
    isAuthenticated: true,
  },
  navigate: vi.fn(),
}));

// Mock the leaf concerns (auth, presentational, sound, toast, routing) but keep
// the REAL useChatSocket / useCommsSummary / useOrg / commsAlerts so the badge
// is produced by production code.
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => h.authState }));
vi.mock("@/components/MiniNebula", () => ({ MiniNebula: () => null }));
vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false],
  useIsMobile: () => false,
}));
vi.mock("@/lib/avatar", () => ({ resolveAvatarUrl: () => null }));
vi.mock("@/lib/ui-sound", () => ({ playNotify: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(() => ({ id: "t", update: vi.fn(), dismiss: vi.fn() })),
}));
vi.mock("@/components/ui/toast", () => ({ ToastAction: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate] }));

import { ChatPanel } from "./ChatPanel";

// --- Controllable WebSocket double ------------------------------------------
class MockWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockWS.CONNECTING;
  onopen: ((e?: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e?: any) => void) | null = null;
  onerror: ((e?: any) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    wsInstances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWS.CLOSED;
    this.onclose?.();
  }
  fireOpen() {
    this.readyState = MockWS.OPEN;
    this.onopen?.();
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

let wsInstances: MockWS[] = [];

const fetchMock = vi.fn(async (url: string) => {
  const u = String(url);
  if (u.endsWith("/api/chat/channels")) {
    return {
      ok: true,
      json: async () => ({
        globalChannelId: 1,
        pabloChannelId: 2,
        companyChannelId: 3,
        companyName: null,
        privateChannels: [],
        unreadCounts: {},
      }),
    };
  }
  if (u.endsWith("/api/orgs/me")) {
    return {
      ok: true,
      json: async () => ({
        org: { id: 1, name: "Org", ownerUserId: "me" },
        member: { orgId: 1, userId: "me", role: "member", status: "active" },
      }),
    };
  }
  if (u.endsWith("/api/comms/summary")) {
    return { ok: true, json: async () => ({ unreadMessages: 0, pendingRequests: 0, total: 0 }) };
  }
  return { ok: false, json: async () => ({}) };
});

let root: Root;
let container: HTMLDivElement;

function makeMessage(over: Record<string, any> = {}) {
  return {
    id: Math.floor(Math.random() * 1e9),
    channelId: 5, // a private channel — not the excluded GLOBAL firehose
    senderUserId: "someone-else",
    senderName: "Coworker",
    senderProfileImageUrl: null,
    isBot: false,
    content: "hey there",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

async function render() {
  await act(async () => {
    root.render(<ChatPanel />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function badgeText(): string {
  const btn = container.querySelector('[data-testid="button-comms-toggle"]');
  return (btn?.textContent ?? "").trim();
}

function clickTestId(testid: string) {
  const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
  if (!el) throw new Error(`no element with data-testid="${testid}"`);
  el.click();
}

function clickButtonContaining(text: string) {
  const btn = Array.from(container.querySelectorAll("button")).find(b =>
    (b.textContent ?? "").includes(text)
  ) as HTMLElement | undefined;
  if (!btn) throw new Error(`no button containing "${text}"`);
  btn.click();
}

function summaryFetchCount(): number {
  return fetchMock.mock.calls.filter(c => String(c[0]).endsWith("/api/comms/summary")).length;
}

beforeEach(() => {
  wsInstances = [];
  (globalThis as any).fetch = fetchMock;
  (globalThis as any).WebSocket = MockWS;
  fetchMock.mockClear();
  window.localStorage.clear();
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

describe("ChatPanel unread FAB badge", () => {
  it("shows no badge until a message arrives", async () => {
    await render();
    expect(badgeText()).toBe("");

    const ws = wsInstances[wsInstances.length - 1];
    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 101 }) });
    });

    expect(badgeText()).toBe("1");
  });

  it("climbs the visible badge as more messages arrive (alerts ON)", async () => {
    // Alerts default ON (no opt-out written).
    await render();
    const ws = wsInstances[wsInstances.length - 1];

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 201, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 202, channelId: 7 }) });
    });

    expect(badgeText()).toBe("2");
  });

  it("still climbs the visible badge when pop-up alerts are OFF", async () => {
    // Opt out of comms pop-up alerts before mount.
    window.localStorage.setItem("salaryman_comms_alerts", "0");
    await render();
    const ws = wsInstances[wsInstances.length - 1];

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 301, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 302, channelId: 5 }) });
    });

    // The alerts-off preference suppresses the toast, NOT the unread badge.
    expect(badgeText()).toBe("2");
  });

  it("clears the visible badge once the channel is opened and read", async () => {
    await render();
    const ws = wsInstances[wsInstances.length - 1];

    // A message lands on the COMPANY channel — the FAB badge climbs.
    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 401, channelId: 3 }) });
    });
    expect(badgeText()).toBe("1");

    const summaryCallsBeforeRead = summaryFetchCount();

    // Open the COMMS panel and switch to the COMPANY conversation — reading it.
    await act(async () => {
      clickTestId("button-comms-toggle");
      await Promise.resolve();
    });
    await act(async () => {
      clickButtonContaining("COMPANY");
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reading the channel re-polls the COMMS summary so the nav badge can clear
    // promptly (the markRead effect fires invalidateCommsSummary()).
    expect(summaryFetchCount()).toBeGreaterThan(summaryCallsBeforeRead);

    // Close the panel again — the FAB badge is gone because the unread cleared.
    await act(async () => {
      clickTestId("button-comms-toggle");
      await Promise.resolve();
    });
    expect(badgeText()).toBe("");
  });
});
