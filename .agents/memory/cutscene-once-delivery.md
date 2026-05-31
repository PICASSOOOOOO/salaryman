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

**Pattern that works (Mila handoff, `mila-handoff`):**
1. At finalize: set a durable pending flag (`localStorage 'salaryman.milaHandoff' = 'pending'`)
   then `navigate(...)` in the SAME tick — no timer.
2. WorldPlay mount effect (the SCENE 1 resume init effect): if story active AND
   `missionIndex >= 1` AND flag === 'pending', replay the navigate. This is the
   backstop for a lost navigation across reloads.
3. CutscenePage clears the flag (`localStorage.removeItem`) on mount when
   `id === 'mila-handoff'` — reaching the page IS the delivery, so it can't loop
   when the player returns to WorldPlay.

**Why:** gives at-most-once (idempotency guard + flag cleared at the page) AND
at-least-once (mount-time replay until shown). Architect failed the first cut
(plain setTimeout) for exactly the zero-fire race above.

**How to apply:** any future once-only story beat keyed off a finalize/idempotency
guard — reuse the pending-flag + mount-replay + clear-at-destination triad, never
a bare delayed navigate.
