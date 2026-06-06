---
name: Global notification toaster vs ChatPanel
description: Why SALARYMAN needs two separate comms-toast surfaces and how they stay non-overlapping
---

There are TWO comms-toast surfaces, by necessity:

- **ChatPanel** toasts LIVE chat (messages + associate requests) via its WS socket. But it is
  gated `showChat = isAuthenticated && !isFullscreenRoute && !isGameRoute`, so it UNMOUNTS on
  `/world/play`, `/office`, `/game`, etc. → its socket drops and chat toasts go silent there.
- **NotificationToaster** consumes the persistent `useNotifications` poll stream (org invites,
  ticket replies, missed/offline DMs, mentions, admin broadcasts) and is mounted OUTSIDE the
  chat gate (only `isAuthenticated`), so it pops everywhere including game/full-screen routes.

**Why they don't double-toast:** the server only inserts a `notifications` row for a DM when the
recipient is DISCONNECTED (`chatServer.ts`: `if (!otherClient)`). While connected, ChatPanel's
live toast fires and no row is written. So the persistent stream only carries things ChatPanel
isn't already showing.

**Baseline rule (the bug class to avoid):** `useNotifications` starts at
`{ notifications: [], loading: true }`, then the first authenticated fetch backfills existing
unread. If you baseline (mark-all-seen) on the first effect pass, that backfill replays as a
burst of toasts at page-load/login. Fix: wait for `loading === false` before setting the init
baseline, and keep `loading` in the effect deps so a fetch-FAILURE (loading flips true→false with
notifications still []) also baselines deterministically. A recency window is a secondary guard,
not a substitute for the loading-gated baseline.

**Pattern mirrors ChatPanel:** seen-id Set, init baseline, 5s coalescing window (update existing
toast, chime once per burst), gated by `useCommsAlerts()` + `useCommsCityDnd()&&useImmersiveViewActive()`.
