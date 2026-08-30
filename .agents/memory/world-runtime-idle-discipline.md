---
name: World runtime idle discipline
description: Runtime invariants for visibility, multiplayer state sends, and dirty save retries.
---

WorldPlay must stop its animation-frame chain while the document is hidden and restart exactly one chain when visible. Nonessential polling should likewise run only while visible, with an immediate refresh on return.

**Why:** A mounted world otherwise consumes CPU and network in background tabs. Duplicate restart chains are worse than continuous rendering because they multiply simulation speed and work.

**How to apply:** Schedule every next frame through one guarded helper, zero the owned RAF id when a callback starts, and cancel it on hide/unmount. Visibility-return logic may restart only when no frame is owned.

Outbound movement and stats should be material-change driven with a bounded cadence, plus an explicit final flush before hide or socket teardown. Reconnects must recreate the complete handler lifecycle rather than swapping in a bare socket.

**Why:** Fixed-rate unchanged sends waste bandwidth, while partial reconnects and unowned sockets silently break multiplayer or leak resources.

**How to apply:** Compare only fields in the server contract, preserve special heal semantics when weapon state also changes, and make one effect own each socket, reconnect timer, send interval, and cleanup.

A save snapshot becomes clean only after the required persistence path reports success. Failed cloud writes must leave the snapshot dirty so an unchanged state is retried.

**Why:** Treating a local write or swallowed network failure as cloud success can leave the server save permanently stale.

**How to apply:** Keep deterministic snapshot comparison separate from persistence success; update the clean snapshot only from a successful save result.