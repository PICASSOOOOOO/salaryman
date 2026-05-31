---
name: Pablo emotion nebula orb
description: How Pablo's particle orb renders, its WebGL→2D fallback, and why screenshots always show the fallback
---

# The screenshot browser forces the 2D fallback (the big trap)
The `screenshot` tool's headless browser reports `prefers-reduced-motion: reduce`.
PabloNebula3D treats reduce-motion (and no-WebGL / lowGfx / context-loss) as a
reason to render `NebulaFallback2D` instead of the R3F `<Canvas>`. So **every
screenshot of /pablo shows the 2D CSS fallback, never the WebGL particle orb** —
tweaking shader/particle params produces pixel-identical screenshots and looks
like HMR is broken. It isn't. You cannot visually verify the WebGL path with the
screenshot tool here; verify it by typecheck + code review + the real browser.
**How to apply:** if /pablo screenshots don't change after orb edits, you're
looking at the fallback. Edit `NebulaFallback2D` to change what the screenshot shows.

# The 2D fallback must cap its bright core in px, not %
The old fallback used percentage insets with a solid `#fff` disc, so at full-bleed
terminal size (~1700px) it became a giant flat white blob covering Pablo. Fix:
size the bright center as `Math.min(size*0.18, 96)` px and use a soft blurred
radial glow (no hard white disc). Same fix applies to the duplicate `NebulaOrb2D`
in PabloTerminal.tsx (only used if PabloNebula3D throws via NebulaErrorBoundary).

# WebGL additive blowout reads as white
Many overlapping additive purple particles sum past 1.0 per channel and clamp to
white, so a too-bright orb looks like a white disc, not purple structure. Keep
per-layer `layerOpacity` and point sizes low (main ~0.55/0.015, haze ~0.2/0.032)
so the purple gradient and "waves of emotion" stay visible.

# Variant system (so Mila's orb can reuse the engine)
`PabloNebula3D({status,size,variant=PABLO_VARIANT})`. `NebulaVariant` exposes
`tint`, per-status `fallback` colors, and `shape{flatten,thickness,waveScale}`.
A second orb (e.g. Mila) is a new variant object, NOT a forked component.
