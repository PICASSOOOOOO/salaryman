---
name: Chat WS stray 400 (path-catch)
description: Why /ws/chat (and meet/conf) log a harmless 400 in the browser console
---

# /ws/chat 400 is cosmetic, not a real break

The world WebSocketServer is created as `new WebSocketServer({ server: httpServer, path: '/ws' })`.
That constructor auto-attaches its own `upgrade` listener on the shared HTTP server, and ws's
`handleUpgrade` calls `abortHandshake(socket, 400)` for any path that isn't exactly `/ws`.

Meanwhile chat (`chatServer.ts`), meet, and conf are each wired as `noServer: true` plus a
manual `server.on('upgrade')` that calls `handleUpgrade` only for their own path. Those manual
handlers DO upgrade their sockets successfully — chat/COMMS/meet/conf all work — but the world
wss's auto-listener also fires for those same upgrades and writes a stray `400`, which surfaces
as a red "WebSocket handshake /ws/chat 400" line in the browser console.

**So:** the 400 is purely cosmetic; presence/COMMS work. Do NOT treat it as a chat auth bug.

**Why noted:** it reappears in every e2e and looks alarming. Don't re-investigate the chat
handshake — the client sends `userId/orgId` params and the server validates them fine.

**Proper fix (only if asked):** make the world wss `noServer: true` and route `/ws` through a
single explicit `server.on('upgrade')` alongside chat/meet/conf, so no listener catches paths
it doesn't own. Touches live game WS routing — regression-risky, so out of scope for QA passes.
