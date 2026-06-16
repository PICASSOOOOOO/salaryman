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

# Reaching the CITY (/world/play) in runTest is NOT just tutorial_done
The office-first funnel bounces uncleared/un-onboarded users to /office, so
`/world/play` redirects away even with `salaryman_tutorial_done=1` set and even
with `localStorage.sm_char` seeded (WorldPlay's own no-char guard redirects to
/world, but a higher office-first gate still wins). The ONLY reliable way to get a
fresh test account into the city is to complete the real /immigration onboarding
flow end-to-end (it registers the world business profile + character), land in
THE OFFICE, then navigate to /world/play. Plan city-view screenshots around the
full onboarding, not a localStorage shortcut.

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

## Deploy gates on `pnpm run typecheck` — frontend TS errors block publish
The deploy `build` (.replit `deployment.build`) = `pnpm run build` = `pnpm run typecheck && pnpm -r run build`. Dev (`vite`/esbuild) STRIPS types and never typechecks, so the app runs fine locally while TS errors silently pile up in WorldPlay.tsx / SkillTree.tsx / .test.tsx — then the publish fails at the typecheck gate.
**Why:** background task agents routinely leave "pre-existing unrelated" WorldPlay TS errors (and tell each other to "verify via LSP not slow tsc"); that tolerance is exactly what breaks deploys.
**How to apply:** before publishing, run `pnpm --filter @workspace/interview-helper run typecheck` (and `:libs` + api-server) — the full root `pnpm run typecheck` is too heavy and times out the agent shell, so run the three stages separately. Common shapes: new dialogue `effect` literals not added to the `DialogueNode.effect` union (gameSystems.ts); new `gs.current` fields read but missing from the init object (one missing field cascades into ~25 "property does not exist on type {…208 more…}" errors); a `useState` referenced in a `useEffect` declared ABOVE it (TDZ); `g.interior?.bid` collapsing to `never` after an unconditional `g.interior = null` earlier in the loop (cast `(g.interior as {bid:string}|null)`).
