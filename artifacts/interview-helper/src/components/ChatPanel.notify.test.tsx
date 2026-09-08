// @vitest-environment jsdom
//
// Guards the two toast firing points in ChatPanel that play the comms chime:
//
//   1. New-message arrival: exactly ONE playNotify() when a fresh toast is
//      created, and NO additional sound when a follow-up arrival within the
//      coalescing window only .update()s the existing toast.
//   2. Associate request: exactly ONE playNotify() each time pendingRequests
//      climbs above the established baseline.
//
// ChatPanel renders to null here (isAuthenticated=false), but all of its
// notification effects run regardless because they are registered before that
// early return. We drive `messages` (from useChatSocket) and `pendingRequests`
// (from useCommsSummary) via hoisted mock state and re-render to fire the effects.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => {
  const channelMeta = { globalChannelId: 1, pabloChannelId: 2, companyChannelId: 3 };
  return {
    chatState: {
      connected: true,
      channelMeta,
      messages: {} as Record<number, any[]>,
      unreadCounts: {},
      totalUnread: 0,
      send: () => {},
      markRead: () => {},
      markAllRead: () => {},
      loadHistory: () => {},
      startPrivateChat: async () => null,
      sendToPablo: async () => {},
      refreshChannels: () => {},
    },
    commsState: { unreadMessages: 0, pendingRequests: 0, total: 0, loading: false },
    commsAlertsOn: true,
    playNotify: vi.fn(),
    toastUpdate: vi.fn(),
    toast: vi.fn(),
    navigate: vi.fn(),
  };
});

h.toast.mockImplementation(() => ({ id: "toast-1", update: h.toastUpdate, dismiss: vi.fn() }));

vi.mock("@/components/MiniNebula", () => ({ MiniNebula: () => null }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));
vi.mock("@/hooks/use-chat-socket", () => ({ useChatSocket: () => h.chatState }));
vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false],
  useIsMobile: () => false,
}));
vi.mock("@/hooks/use-comms-summary", () => ({
  invalidateCommsSummary: vi.fn(),
  useCommsSummary: () => h.commsState,
}));
vi.mock("@/lib/avatar", () => ({ resolveAvatarUrl: () => null }));
vi.mock("@/lib/commsAlerts", () => ({
  useCommsAlerts: () => [h.commsAlertsOn, () => {}],
  useCommsCityDnd: () => [false, () => {}],
  useImmersiveViewActive: () => false,
}));
vi.mock("@/lib/ui-sound", () => ({ playNotify: h.playNotify }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/components/ui/toast", () => ({ ToastAction: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate] }));

import { ChatPanel } from "./ChatPanel";

function makeMessage(over: Partial<any> = {}) {
  return {
    id: Math.floor(Math.random() * 1e9),
    channelId: 5, // a private channel — not the excluded GLOBAL firehose
    senderUserId: "someone-else",
    senderName: "Coworker",
    content: "hey there",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

let root: Root;
let container: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(<ChatPanel />);
  });
}

beforeEach(() => {
  h.chatState.messages = {};
  h.commsState = { unreadMessages: 0, pendingRequests: 0, total: 0, loading: false };
  h.commsAlertsOn = true;
  h.playNotify.mockClear();
  h.toast.mockClear();
  h.toastUpdate.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

describe("new-message chime", () => {
  it("plays once when a new-message toast is created", async () => {
    await render(); // baseline pass — establishes the message init baseline

    const a = makeMessage();
    h.chatState.messages = { 5: [a] };
    await render();

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });

  it("does NOT play again when a coalesced arrival only updates the toast", async () => {
    await render(); // baseline

    const a = makeMessage();
    h.chatState.messages = { 5: [a] };
    await render(); // creates the toast + one chime

    const b = makeMessage();
    h.chatState.messages = { 5: [a, b] };
    await render(); // within coalescing window -> .update() path, no new sound

    // Still a single created toast and a single chime, plus one update call.
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toastUpdate).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });
});

describe("associate-request chime", () => {
  it("plays exactly once when pendingRequests climbs", async () => {
    await render(); // baseline — pendingRequests = 0 establishes the baseline

    h.commsState = { ...h.commsState, pendingRequests: 1 };
    await render();

    expect(h.playNotify).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
});

describe("comms alerts disabled", () => {
  // When the user turns OFF comms pop-up alerts (commsAlertsOn = false), the
  // notification effects still walk every message and advance their baselines
  // (so badge/unread counts stay correct) but must NOT create a toast or play
  // the chime. These guard that the `if (!commsAlertsOn) return;` gate holds.
  it("does NOT toast or chime for a new message when alerts are off", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline

    h.chatState.messages = { 5: [makeMessage()] };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("does NOT toast or chime for a climbing pendingRequests when alerts are off", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline — establishes the pendingRequests baseline

    h.commsState = { ...h.commsState, pendingRequests: 1 };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("restores the pop-up + chime once alerts are re-enabled", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline established with alerts off

    // Flip the preference back on, then a fresh message arrives.
    h.commsAlertsOn = true;
    h.chatState.messages = { 5: [makeMessage()] };
    await render();

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });

  // The other half of the contract: the effects run while alerts are off
  // SPECIFICALLY so the seen-message / pending baselines keep advancing. If a
  // message that arrived while off were NOT recorded in the baseline, then
  // re-enabling alerts would replay a stale toast for it. These lock that down.
  it("advances the seen-message baseline while off (no stale replay on re-enable)", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline pass — establishes the message init baseline

    // A message arrives while alerts are off: no toast/chime, but its id must
    // be recorded as seen so it is never re-considered.
    const a = makeMessage();
    h.chatState.messages = { 5: [a] };
    await render();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();

    // Re-enable alerts with the SAME message still present. Because its id was
    // recorded while off, it is not replayed as a fresh toast.
    h.commsAlertsOn = true;
    await render();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("advances the associate-request baseline while off (no stale replay on re-enable)", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline — establishes the pendingRequests baseline at 0

    // A request arrives while alerts are off: no toast/chime, but the baseline
    // must climb to 1 so the climb isn't re-detected later.
    h.commsState = { ...h.commsState, pendingRequests: 1 };
    await render();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();

    // Re-enable alerts with the SAME pending count. Because the baseline already
    // advanced to 1, there is no climb to toast.
    h.commsAlertsOn = true;
    await render();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });
});
