---
name: COMMS ChatPanel per-channel scroll
description: Why the COMMS terminal Pablo chat must open at the latest message, and how the scroll state leaks across channels.
---

# COMMS ChatPanel opens at oldest message (bug class)

The COMMS terminal (`ChatPanel.tsx`) renders one shared `MessageList` instance for
the active channel (GLOBAL / COMPANY / PABLO / private DMs). `MessageList` owns an
`autoScroll` boolean (true = stick to bottom).

**Rule:** `MessageList` MUST be keyed by the active channel id (`key={activeChannelId}`)
so it remounts per channel, AND its first paint per channel must jump to the bottom
instantly (scroll-behavior auto, gated by a `didInitialScroll` ref).

**Why:** Without the key, switching channels reuses the same component instance. If the
user scrolled up in one channel (`autoScroll` flips to false via `handleScroll`), that
false state carries into the next channel they open — so opening the Pablo tab lands on
the OLDEST message instead of the latest interaction. The container also has CSS
`scroll-behavior: smooth`, so a naive `scrollTop = scrollHeight` animates up from the
first message; the initial jump must temporarily force `scroll-behavior: auto`.

**How to apply:** Any new channel/tab added to COMMS inherits this automatically as long
as the `key` stays on `MessageList`. Don't remove the key or the `didInitialScroll`
instant-jump. Note: desktop `PabloTerminal.tsx` shows only the latest reply ephemerally
(no scrollable history); `MobileTerminal.tsx` Pablo tab starts empty (no persisted load).
The persisted, paginated Pablo history lives in COMMS `ChatPanel`.
