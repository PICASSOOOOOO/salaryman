---
name: Deploy build typecheck gate
description: Why publishes fail on TS errors that dev never surfaces, and how to pre-flight a deploy.
---

# Deploy build typecheck gate

The production/publish build runs the root `pnpm run build`, which is
`pnpm run typecheck && pnpm -r --if-present run build`. So `tsc` runs FIRST and
a single type error anywhere in the workspace aborts the publish before any
bundling happens.

Dev does NOT typecheck: the api-server dev workflow runs via `tsx`, and the web
dev server is `vite` (esbuild transform, no type errors). So TypeScript errors
accumulate silently during normal development and only ever surface at publish
time as a "deployment build failed".

**Why:** Task-agent merge notes frequently say things like "pre-existing
unrelated TS errors (loginWithGithub, art_assets schema columns,
accountIdentitiesTable) are not from this change." Those get waved past because
dev still runs — but they are exactly what breaks the next publish. The
tsconfig includes `__tests__`, so a type error in a `.test.ts` (e.g. a `vi.fn`
mock with no params being called with `...spread`) also fails the deploy build.

**How to apply:** Before telling the user to publish, run `pnpm run typecheck`
(fast, ~30-60s) and fix every error. Do NOT rely on `pnpm run build` to verify —
the web `vite build` of interview-helper is very slow (several minutes,
especially while the 3 dev workflows compete for CPU) and a 120s tool timeout
will kill it with no output, which looks like a failure but isn't. To verify a
bundle build, run it fully detached (`setsid bash -c '...'`) and poll a done
marker across turns; api-server build (`tsx ./build.ts` → `dist/index.cjs`) is
fast (~5s) and is the actual deploy run target.
