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

Merged feature work can leave simple structural errors such as duplicate imports
that Vite tolerates but `tsc` rejects; the publish preflight is the authoritative
check for those regressions.

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

Artifact publishing runs the root `.replit` deployment build as a pre-build
hook and then runs each artifact's own production build. Keep the root hook to
one version bump plus typecheck, and keep each artifact build package-scoped.

**Why:** Pointing the web artifact back at the root workspace build rebuilt the
entire workspace a second time. The first frontend bundle completed, then the
duplicate 4,956-module Vite pass terminated abruptly on the 2 GiB publish
builder at peak memory.

**How to apply:** Never use the root recursive build as an artifact's
`services.production.build`. The web artifact should invoke only its filtered
package build; the API artifact should do the same.

## Web-standard binary APIs need owned buffers

Node `Buffer` values can fail the publish TypeScript gate when passed directly
to browser-standard APIs such as `Blob`: the deployment toolchain may type the
buffer as `ArrayBufferLike`, while `BlobPart` requires an owned `ArrayBuffer`.
Copy binary data into a fresh `ArrayBuffer` before constructing `Blob` or
`FormData` payloads.

**Why:** The Soniox upload path worked in development and its runtime tests but
the publish compiler rejected `Buffer<ArrayBufferLike>` against the stricter
DOM typings.

**How to apply:** For server-side multipart uploads, allocate an
`ArrayBuffer`, copy the Node buffer through `Uint8Array`, and pass that owned
array to `Blob`; keep the publish typecheck as the authority.
