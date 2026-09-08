// @vitest-environment jsdom
//
// Guards the unread-badge wiring inside the REAL useChatSocket hook. The
// ChatPanel notify tests mock this hook out entirely, so a regression that
// stopped incoming messages from climbing the unread counts (the surface the
// FAB / tab / nav badges read) would slip past them. These exercise the live
// hook end to end: a WebSocket `chat_message` event must bump both the
// channel-level count (unreadCounts[channelId]) and the aggregate
// (totalUnread), the server snapshot from refreshChannels must seed those
// counts, and markRead must clear them.
//
// The hook has no notion of the comms pop-up-alerts preference — the badge is
// produced unconditionally — so these counts climb identically whether alerts
// are on or off. ChatPanel.badge.test.tsx pins that alerts-independence at the
// rendered-badge level.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  authState: {
    user: { id: "me", firstName: "Me", lastName: "User", email: "me@example.com" },
    isAuthenticated: true,
  },
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => h.authState }));

import { useChatSocket, type ChatMessage } from "./use-chat-socket";

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
  // test helpers
  fireOpen() {
    this.readyState = MockWS.OPEN;
    this.onopen?.();
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

let wsInstances: MockWS[] = [];
let channelMeta: any;

const fetchMock = vi.fn(async (url: string) => {
  const u = String(url);
  if (u.endsWith("/api/chat/channels")) {
    return { ok: true, json: async () => channelMeta };
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
  return { ok: false, json: async () => ({}) };
});

let captured: ReturnType<typeof useChatSocket> | null = null;
function Capture() {
  captured = useChatSocket();
  return null;
}

let root: Root;
let container: HTMLDivElement;

function makeMessage(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: Math.floor(Math.random() * 1e9),
    channelId: 5,
    senderUserId: "someone-else",
    senderName: "Coworker",
    senderProfileImageUrl: null,
    isBot: false,
    content: "hey there",
    createdAt: new Date().toISOString(),
    ...over,
  } as ChatMessage;
}

async function mount() {
  await act(async () => {
    root.render(<Capture />);
  });
  // Flush refreshChannels()/useOrg() fetches kicked off in the mount effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  wsInstances = [];
  captured = null;
  channelMeta = {
    globalChannelId: 1,
    pabloChannelId: 2,
    companyChannelId: 3,
    companyName: null,
    privateChannels: [],
    unreadCounts: {},
  };
  (globalThis as any).fetch = fetchMock;
  (globalThis as any).WebSocket = MockWS;
  fetchMock.mockClear();
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

describe("useChatSocket unread badge wiring", () => {
  it("climbs the channel-level count and the aggregate when a message arrives", async () => {
    await mount();
    const ws = wsInstances[wsInstances.length - 1];
    expect(ws).toBeTruthy();

    expect(captured!.unreadCounts[5] ?? 0).toBe(0);
    expect(captured!.totalUnread).toBe(0);

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 11, channelId: 5 }) });
    });

    expect(captured!.unreadCounts[5]).toBe(1); // channel-level badge
    expect(captured!.totalUnread).toBe(1); // aggregate badge
  });

  it("aggregates unread across multiple channels", async () => {
    await mount();
    const ws = wsInstances[wsInstances.length - 1];

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 21, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 22, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 23, channelId: 7 }) });
    });

    expect(captured!.unreadCounts[5]).toBe(2);
    expect(captured!.unreadCounts[7]).toBe(1);
    expect(captured!.totalUnread).toBe(3); // 2 + 1 summed across channels
  });

  it("does not double-count a message id that arrives twice", async () => {
    await mount();
    const ws = wsInstances[wsInstances.length - 1];

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 31, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 31, channelId: 5 }) });
    });

    expect(captured!.unreadCounts[5]).toBe(1);
    expect(captured!.totalUnread).toBe(1);
  });

  it("seeds the badge counts from the server channel snapshot", async () => {
    channelMeta.unreadCounts = { 5: 4, 7: 1 };
    await mount();
    const ws = wsInstances[wsInstances.length - 1];
    // A `ready` frame re-pulls the channel list / unread snapshot.
    await act(async () => {
      ws.fireOpen();
      ws.fireMessage({ type: "ready" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured!.unreadCounts[5]).toBe(4);
    expect(captured!.unreadCounts[7]).toBe(1);
    expect(captured!.totalUnread).toBe(5);
  });

  it("clears a channel's count via markRead and lowers the aggregate", async () => {
    await mount();
    const ws = wsInstances[wsInstances.length - 1];

    await act(async () => {
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 41, channelId: 5 }) });
      ws.fireMessage({ type: "chat_message", message: makeMessage({ id: 42, channelId: 7 }) });
    });
    expect(captured!.totalUnread).toBe(2);

    await act(async () => {
      captured!.markRead(5, 41);
    });

    expect(captured!.unreadCounts[5]).toBe(0);
    expect(captured!.unreadCounts[7]).toBe(1);
    expect(captured!.totalUnread).toBe(1); // only the unread channel remains
  });
});
