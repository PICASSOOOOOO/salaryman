---
name: One-shot story cutscene delivery
description: How to fire a story cutscene exactly once without losing it to an unmount race (Mila handoff pattern)
---

# One-shot story cutscene "exactly once" delivery

A one-time story cutscene that triggers from a mission-finalize must NOT rely on
`setTimeout(() => navigate(...), N)` when that same finalize sets its idempotency
guard immediately (e.g. `missionIndex >= 1`). If the component unmounts within the
delay window, the navigate never runs AND the guard blocks any re-fire → the
cutscene fires ZERO times, permanently.

**Pattern that works:**
1. At finalize: set a durable pending flag in localStorage, then `navigate(...)` in
   the SAME tick — no timer.
2. The world's mount/resume init effect: if the story is active AND the finalize
   guard is set AND the flag is still pending, replay the navigate. This is the
   backstop for a lost navigation across reloads.
3. The cutscene page clears the flag on mount for that cutscene id — reaching the
   page IS the delivery, so it can't loop when the player returns to the world.

**Why:** gives at-most-once (idempotency guard + flag cleared at the page) AND
at-least-once (mount-time replay until shown). Architect failed the first cut
(plain setTimeout) for exactly the zero-fire race above.

**How to apply:** any future once-only story beat keyed off a finalize/idempotency
guard — reuse the pending-flag + mount-replay + clear-at-destination triad, never
a bare delayed navigate.
