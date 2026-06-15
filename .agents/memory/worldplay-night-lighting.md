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

**Soft shadows (now implemented, was the "Deferred" item):** grounded shadows are
drawn at each entity's/building's OWN draw site, NOT in this late composite pass (a
shadow added here would paint over already-drawn entities). Scene key light reads
from the UPPER-LEFT (the iso cube's right face is the dark face), so every shadow
throws DOWN-RIGHT. (1) Buildings: a soft cast shadow drawn INSIDE the generic iso
building block right after `depthX/depthY` are defined and BEFORE the roof/walls
(so the building sits on its own shadow); shape = the ground-footprint quad offset
down-right, softened by a few stacked outward-expanded layers (no per-building
gradient object — cheap). Tower/subway/player-buildings have their own branches and
are intentionally NOT covered (tower has a plaza base, subways are fog-shrouded).
(2) Player + NPCs already had a hard 1-ellipse contact shadow at their feet; both
upgraded to 2 stacked ellipses (soft penumbra) nudged down-right. ALL shadow alphas
scale with `dayBright` (0.3 night → 1.0 midday) so they firm up by day and fade at
night. NPC shadow clears `shadowBlur` first so it doesn't inherit the neon glow;
player shadow forces `globalAlpha=1` so it doesn't blink with the invuln flicker.

**Atmosphere extensions on this same pass:** the pass now ALSO carries (1) a
player-centred radial DEPTH-FOG haze drawn just above the light/dark block — it is
NOT lume-gated (faint by day, stronger at night via `(0.9-dayBright)/0.6`) and fills
the whole screen `(0,0,cw,ch)` centred on `(g.px+ox, g.py+oy)`; and (2) NEON
GROUND-GLOW pools added inside the existing per-building neon loop (lume-gated) — a
squashed (scale y=0.4) additive ellipse at each building base `(bx+b.w/2, by+b.h)`
in the building's seeded colour. Both are cheap gradient fills reusing the proven
coord idiom; daytime fog is the only non-night addition here.
