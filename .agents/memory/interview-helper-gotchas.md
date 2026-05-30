---
name: interview-helper repo gotchas
description: Non-obvious environment quirks when working in artifacts/interview-helper (esp. the huge WorldPlay.tsx)
---

# `read` tool caps below the real file size (the reliable, recurring trap)
WorldPlay.tsx is ~23,900 lines, but the `read` tool reports its length as ~16,615
and refuses offsets beyond that. To VIEW/locate code past ~16,600 use `rg` (or
`awk`/`sed`); the `edit` tool matches by string content (not line number), so edits
past the cap still land correctly.
**How to apply:** confirm true length with `wc -l` first; for anything past ~16,600
locate with `rg` and edit by content, never `read`.

# rg is reliable here — earlier "mangled output" note was not reproduced
A prior memory claimed `rg` garbled identifiers (e.g. "desk"→"n") and that grep line
numbers disagreed with reality. In practice `rg` output was CLEAN and its line
numbers matched `read` exactly (verified at lines 108, 8972, 17251). Treat the old
"mangling" claim as unreliable/intermittent at most: trust `rg`, but if any single
result ever looks garbled, re-confirm that one spot with `read`/`awk`.

# Fog safety is gated by ONE function: gasSafeZone
`gasSafeZone(px,py,homeCx,homeCy)` (top of WorldPlay.tsx) is the single source of
truth used by BOTH the gas-damage check AND the per-cell fog VISUAL render. To
change where fog covers / recedes, edit ONLY gasSafeZone and damage + visuals stay
in sync. Year-long dissipation (fogYearClearRadius) is wired in there.

## Production build is SLOW, not hung (WorldPlay.tsx)
`vite build` transforms all ~4700 modules fine (✓ at ~40s) then sits 70s+ in
rollup chunk-render/minify on the 24k-line WorldPlay.tsx before writing
dist/assets. Total build exceeds the ~2-min agent shell cap, and the sandbox
REAPS detached/setsid background processes when the spawning tool call ends — so
a backgrounded build vanishes without finishing (looks "killed"/"hung" but isn't).
To observe a full build, run it inside ONE long-lived shell call and poll the log;
don't conclude "hung" from idle CPU at the "transforming..."/render stage.
Deployment runs the build in its own env, so slow-but-clean here = publishable.
The `tooltip.tsx (2:0) sourcemap` line is a benign rollup warning, not a failure.
