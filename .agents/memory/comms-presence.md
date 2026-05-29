---
name: COMMS presence / online dots
description: How online/away status is computed and kept fresh in the in-game COMMS hub
---

# Presence model

The in-game COMMS hub (ChatPanel = the COMMS UI) shows online dots for DM
contacts and the associates directory. Presence is server-derived, not a
dedicated presence service.

- Server computes `online` + `lastSeenAt` from `max(org_members.lastSeenAt)`
  across a user's org memberships (heartbeat updates `lastSeenAt`).
- `online` = within a 90s window (matches `PRESENCE_WINDOW_MS` in
  `organizations.ts`). Both `GET /chat/channels` (privateChannels.otherUser)
  and `GET /colleagues/contacts` return the same shape.
- No schema migration was needed — `org_members.lastSeenAt` already existed.

**Why:** keeps presence cross-org and avoids a separate presence table/socket
channel; the heartbeat already exists.

# Freshness rule (the gotcha)

`online` is a boolean computed at fetch time on the server, so it is only as
fresh as the last channel fetch. The chat socket's poll timer originally only
called `refreshChannels()` when the WS was NOT open, so on a healthy WS the dots
never updated.

**How to apply:** the client must periodically re-fetch channel meta even while
the WS is OPEN (currently every ~32s = every 4th 8s tick in
`use-chat-socket.ts`). If you ever push presence over WS instead, you can drop
this poll. Don't assume a single fetch keeps dots correct.
