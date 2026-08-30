---
name: Realtime API indexes
description: Durable invariants for indexed world/chat fan-out and multi-socket read state.
---

Keep realtime recipient membership indexed by the same lifecycle helpers that own socket/player registration and cleanup. Build and serialize one payload per city/channel fan-out, not once per recipient.

**Why:** Global scans and per-recipient roster rebuilding amplify routine movement and presence traffic. Multiple tabs also make user-keyed socket replacement and read-then-write cursors race.

**How to apply:** Any new world/chat subscription path must update its city/channel index and remove only the exact disconnected socket. Read cursors must remain unique per user/channel and advance monotonically with atomic upserts.