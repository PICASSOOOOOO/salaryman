---
name: WorldPlay night lighting pass
description: How/where the city light/dark atmosphere pass is composited, and the double-tint gotcha
---

# WorldPlay night light/dark atmosphere

The city light/dark mood pass (edge vignette + warm player lantern + additive
neon/fluorescent building glows) lives in `WorldPlay.tsx`, inserted **inside the
world transform, immediately before the end-of-world `ctx.restore()`** — the
restore that is directly followed by the existing `if (isNight)` screen tint.

**Coordinate model at that point (reuse it, don't reinvent):** the full screen is
the rect `(0,0,cw,ch)` where `cw = logW/zoom`, and a world point `(wx,wy)` draws at
`(wx+ox, wy+oy)` (`ox=-cam.x`, `oy=-cam.y`). Same idiom as the surrounding
casings/hit-effects/weather draws. Interiors never reach here (the `g.interior`
branch reschedules + `return`s near the top of the loop), so this is city-only.

**Gating:** `lume = isNight?1 : isDusk?0.55 : isDawn?0.4 : 0`, early-exit `<=0.01`,
so daytime is a true no-op. Wrap the whole pass in `ctx.save()/ctx.restore()`
because it sets `globalCompositeOperation='lighter'`.

**Double-tint gotcha (`**Why:**`):** there is ALSO a flat post-restore night tint
`rgba(8,12,45,0.28)` that stacks on top of this vignette. The two darkenings
compound, so when tuning night darkness, account for BOTH — bumping the vignette
edge alpha alone over-crushes nights. Vignette edge alpha is intentionally kept
modest (~0.34) for this reason.

**Deferred (drift):** true directional/contact cast shadows from buildings/entities
were intentionally NOT implemented — entities are drawn earlier in the loop, so a
contact shadow added at this late composite point would paint over them; doing it
right needs per-entity shadow draws at each entity's own draw site, a much larger
change. Current pass is additive-glow + vignette only.
