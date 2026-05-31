---
name: Pablo nebula canonical visual
description: Which Pablo /pablo nebula rendering is the user-approved one, and how to verify "restore the nebula" requests
---

The user-approved Pablo nebula on `/pablo` is the **fullscreen wave-field GLSL shader** — a smooth, painterly "Akira-vapor" of violet/blue/pink wavy emotion (a single fullscreen quad with domain-warped fbm noise; idle palette blends violet→blue→pink). The user calls it the "wavy emotional 4k" look. Their approved reference: an attached screenshot captioned "I LIKE THIS STYLE YOU HAVE HERE. I HOPE IT DOESN'T CHANGE".

It is **NOT** the particle/emotion **orb** (a spherical shell of additive point sprites around a pulsing core, ~659-line PabloNebula3D exporting tint/shape variants). The user explicitly rejected the orb ("I don't want the orb"). The orb art lived in commits `7f0d717` / `c8c8a34` and was even what the `e21cb36` "Published your App" commit happened to ship — but a publish commit shipping it does NOT make it approved. Trust the user's stated preference (wavy shader) over which art a deploy snapshot contained.

The wave-field shader art lives at commit `465de13` (the last change before the orb rewrites): `git show 465de13:artifacts/interview-helper/src/components/PabloNebula3D.tsx`.

**Why:** "Restore Pablo's nebula" has been misread in BOTH directions (older starfield, and the orb). The durable truth is the *wavy painterly shader*, confirmed against the user's own reference image.

**How to apply:**
- Restore the wave-field shader (base it on `465de13`), keep it as a fullscreen quad, NOT a particle orb.
- Preserve the Pablo/Mila persona variant feature additively: keep exports `PabloNebula3D`, `NebulaStatus`, `NebulaVariant`, `PABLO_VARIANT`, `MILA_VARIANT`, and PabloNebula3D's optional `variant` prop (default Pablo). Variant carries a per-status `palette` (primary/secondary/accent THREE.Vector3 for the shader) + `fallback` (2D CSS colors). Pablo = violet/magenta, Mila = aqua/teal. Wave dynamics are shared.
- PabloTerminal wires `variant={persona==="mila"?MILA_VARIANT:PABLO_VARIANT}`; other consumers (MiniNebula, PabloNavButton, PabloDeck, PledgeStore, Immigration, PixelAgents) pass no variant and must keep working on the default.
- **You CANNOT screenshot the real shader in the agent sandbox**: the headless browser can't even create a WebGL context ("A WebGL context could not be created"), so /pablo always renders the 2D CSS fallback (a flat radial "orb" glow). Do not mistake that fallback for the orb art and do not "fix" it. Verify via typecheck + matching the `465de13` shader to the reference image, not via screenshot.

**Preview WebGL gotcha (recurring confusion):** The Replit editor preview iframe AND the agent's headless screenshot browser CANNOT create a WebGL context ("A WebGL context could not be created"), so `/pablo` here ALWAYS shows the flat 2D fallback orb (`NebulaFallback2D` — a uniform radial purple glow, small capped core), NEVER the real shader. A "the nebula looks plain/flat/small/broken" report from the preview is this fallback, not a code regression. The real shader (colorful violet/blue/pink wavy vapor) renders only in a real browser / the published site. Do NOT chase it as a bug or screenshot to "verify" the shader — verify by diffing the nebula files vs the deploy commit instead.
