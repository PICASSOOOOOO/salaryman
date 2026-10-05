---
name: Comms outgoing delivery
description: Reliability boundary between outgoing chat sends and the live WebSocket
---

Ordinary Comms messages use the authenticated HTTP send endpoint for outgoing delivery and an optimistic local bubble for immediate feedback. The chat WebSocket remains the incoming/realtime transport, including proactive subscriptions to known private channels. Bound the client wait so a stalled request cannot keep the composer disabled indefinitely; retain the draft and describe delivery as uncertain because aborting the browser request does not cancel server work.

**Why:** A WebSocket send had no acknowledgement and only appeared after the asynchronous database insert was broadcast, so a slow insert looked like a dropped message and the composer cleared before delivery was known. A request without a timeout can freeze the composer, while a manual retry after an ambiguous timeout can duplicate a message.

**How to apply:** If outgoing chat changes, preserve the HTTP response reconciliation and do not make the sender wait for its own WebSocket broadcast. Keep the live socket subscribed to every known DM so the recipient receives messages without opening the thread first.