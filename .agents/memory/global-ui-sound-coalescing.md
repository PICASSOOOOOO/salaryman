---
name: Global UI sound coalescing
description: Why the app-wide click-sound listener must defer to a fallback instead of playing immediately, to avoid double-beeps with handlers that play their own sounds.
---

A single document-level capture-phase `click` listener gives every interactive
control a sound without editing call sites. The trap: many handlers already
play a *richer* sound (nav / sting / success). A capture listener runs BEFORE
the element's own onClick, so playing immediately double-fires (generic tick +
the handler's real sound). Per-sound debounce does NOT help — different sound
keys don't collide.

**Rule:** the global listener must be a *deferred fallback*. Snapshot a shared
monotonic "sound epoch" (bumped on every sound that actually plays), then
`setTimeout(0)` and only play the generic tick if the epoch did not advance
during the dispatch.

**Why:** `setTimeout(0)` lets the full native dispatch — including React's
synthetic onClick at the root container (bubble phase) — finish first, so any
explicit `play*()` increments the epoch before the fallback check runs. If it
advanced, a real sound already played → stay silent.

**How to apply:** lives in `lib/global-ui-sound.ts` + `lib/ui-sound.ts`
(`getSoundEpoch`). Opt a subtree out entirely with `data-no-sfx`. Don't revert
to immediate play "to remove latency" — the ~0-4ms tick delay is inaudible and
removing the defer brings the double-beep back.
