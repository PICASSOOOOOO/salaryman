// @vitest-environment jsdom
//
// Guards the global persistent-notification toaster that pops a chime+toast for
// org invites, ticket replies, missed DMs & mentions on ANY route (it is mounted
// outside the chat gate so it works on game/full-screen routes too).
//
// Contract:
//   1. A FRESH unread notification → exactly ONE toast + ONE playNotify().
//   2. A second fresh arrival within the coalescing window → .update() only,
//      NO additional chime.
//   3. Pre-existing / backfilled notifications (older than the recency window, or
//      already present on first render) are silently baselined — never toasted —
//      so page-load / post-login never replays old unread as fresh toasts.
//   4. read:true notifications never toast.
//   5. With comms alerts OFF: no toast/chime, but the seen baseline still
//      advances so re-enabling never replays a stale toast.
//
// The component renders to null; its effect runs on every re-render. We drive
// `notifications` (from useNotifications) via hoisted mock state.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  notifState: { notifications: [] as any[], unreadCount: 0, loading: false },
  commsAlertsOn: true,
  playNotify: vi.fn(),
  toastUpdate: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}));

h.toast.mockImplementation(() => ({ id: "toast-1", update: h.toastUpdate, dismiss: vi.fn() }));

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => h.notifState,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: "me" } }),
}));
vi.mock("@/lib/commsAlerts", () => ({
  useCommsAlerts: () => [h.commsAlertsOn, () => {}],
  useCommsCityDnd: () => [false, () => {}],
  useImmersiveViewActive: () => false,
}));
vi.mock("@/lib/ui-sound", () => ({ playNotify: h.playNotify }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/components/ui/toast", () => ({ ToastAction: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate] }));

import { NotificationToaster } from "./NotificationToaster";

let idSeq = 1;
function makeNotif(over: Partial<any> = {}) {
  return {
    id: idSeq++,
    userId: "me",
    type: "org_invite",
    title: "New invite",
    body: "You were invited to OMBRA CORP",
    link: "/comms",
    read: false,
    createdAt: new Date().toISOString(), // fresh by default
    ...over,
  };
}

let root: Root;
let container: HTMLDivElement;

async function render() {
  await act(async () => {
    root.render(<NotificationToaster />);
  });
}

beforeEach(() => {
  idSeq = 1;
  localStorage.clear();
  h.notifState = { notifications: [], unreadCount: 0, loading: false };
  h.commsAlertsOn = true;
  h.playNotify.mockClear();
  h.toast.mockClear();
  h.toastUpdate.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

describe("fresh notification chime", () => {
  it("plays once when a fresh unread notification arrives", async () => {
    await render(); // baseline (empty)

    h.notifState = { ...h.notifState, notifications: [makeNotif()] };
    await render();

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });

  it("does NOT chime again when a coalesced arrival only updates the toast", async () => {
    await render(); // baseline

    const a = makeNotif();
    h.notifState = { ...h.notifState, notifications: [a] };
    await render(); // creates toast + one chime

    const b = makeNotif();
    h.notifState = { ...h.notifState, notifications: [a, b] };
    await render(); // within coalescing window -> update only

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toastUpdate).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });
});

describe("baseline / backfill suppression", () => {
  it("does NOT toast pre-existing unread present on first render", async () => {
    h.notifState = { ...h.notifState, notifications: [makeNotif(), makeNotif()] };
    await render(); // first render baselines them as seen

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("does NOT toast a notification older than the recency window", async () => {
    await render(); // baseline empty

    const stale = makeNotif({ createdAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    h.notifState = { ...h.notifState, notifications: [stale] };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("does NOT toast an already-read notification", async () => {
    await render(); // baseline empty

    h.notifState = { ...h.notifState, notifications: [makeNotif({ read: true })] };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  // The login / page-load replay path: the hook starts at { loading:true,
  // notifications:[] } and the FIRST real fetch backfills recent unread. The
  // baseline must wait for loading=false, otherwise that backfill replays as a
  // burst of toasts the moment the page opens.
  it("does NOT toast recent unread backfilled by the first fetch (loading -> settled)", async () => {
    h.notifState = { notifications: [], unreadCount: 0, loading: true };
    await render(); // still loading — must NOT baseline yet

    // First fetch resolves with a freshly-created unread already on the account.
    h.notifState = { notifications: [makeNotif()], unreadCount: 1, loading: false };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();

    // A genuinely-new item that arrives AFTER settling still toasts.
    h.notifState = {
      notifications: [...h.notifState.notifications, makeNotif()],
      unreadCount: 2,
      loading: false,
    };
    await render();
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });

  // Startup fetch-FAILURE recovery: the first fetch can fail, flipping only
  // loading true->false with notifications still []. Baseline must initialize on
  // that settled-empty pass so the first *successful* payload afterwards still
  // toasts (and isn't suppressed as backfill). `loading` is in the effect deps
  // so this transition is observed even though the notifications ref is unchanged.
  it("still toasts the first payload after a failed initial fetch (loading flips with no data)", async () => {
    h.notifState = { notifications: [], unreadCount: 0, loading: true };
    await render(); // still loading

    // Fetch fails: loading flips false, notifications stays empty.
    h.notifState = { notifications: [], unreadCount: 0, loading: false };
    await render(); // settled-empty -> baseline established here

    // A later successful poll brings in a fresh unread — it should toast.
    h.notifState = { notifications: [makeNotif()], unreadCount: 1, loading: false };
    await render();

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotify).toHaveBeenCalledTimes(1);
  });
});

describe("comms alerts disabled", () => {
  it("does NOT toast or chime while alerts are off", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline

    h.notifState = { ...h.notifState, notifications: [makeNotif()] };
    await render();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });

  it("advances the seen baseline while off (no stale replay on re-enable)", async () => {
    h.commsAlertsOn = false;
    await render(); // baseline

    const a = makeNotif();
    h.notifState = { ...h.notifState, notifications: [a] };
    await render(); // recorded as seen, no toast
    expect(h.toast).not.toHaveBeenCalled();

    // Re-enable with the SAME notification still present: it was already seen,
    // so it must not replay as a fresh toast.
    h.commsAlertsOn = true;
    await render();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotify).not.toHaveBeenCalled();
  });
});
