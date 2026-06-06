---
name: Chat city badge / cross-city chat
description: How per-message city/realm badges work in comms chat, and the dual send-path invariant.
---

# Cross-city chat + city badge

Global chat already spans all cities — there is ONE `type:'global'` chat channel
(`getOrCreateGlobalChannel`) every client subscribes to on connect. "Reach across
cities" needed no new fan-out; the work was attaching the sender's city per message.

## The dual send-path invariant
A chat message can be created on TWO paths, and BOTH must stamp `senderCity` or
badges silently go missing on whichever path you forget:
- WebSocket: `chatServer.ts` `handleSendMessage` (live, the common path).
- REST fallback: `POST /chat/channels/:channelId/send` in `routes/chat.ts`
  (used when the WS is down). The client `useChatSocket.send()` falls back to it.

**Why:** an architect review caught the WS path stamped, the REST path didn't.
**How to apply:** any new field on a chat message must be added to both inserts +
both response/broadcast payload shapes, and to the client body for the REST path.

## City source & metadata
- City value is client-supplied: client sends `cityId=getActiveCityId()` (from
  `lib/city-defs`, the in-world active realm) on WS connect and in the REST body.
  It is metadata only (spoofable) — never use it for access control.
- Badge rendering metadata (icon/cityName/accentColor) comes from the CLIENT
  module `lib/world-servers.ts` `getCityById`, NOT the DB `server-regions` schema.
  These are two separate city lists; world-servers is the client-safe one.
- `CityBadge` renders only for known city IDs; null/unknown (bots, system,
  legacy pre-column rows) render nothing.

## Schema rollout
`chat_messages.sender_city` (varchar 40, nullable) was applied with `drizzle-kit
push` (`pnpm --filter @workspace/db run push`) — this repo uses push, not generated
migration files. After editing lib/db schema, rebuild composite types
(`tsc --build lib/db/tsconfig.json`) or api-server won't see the new column type.
