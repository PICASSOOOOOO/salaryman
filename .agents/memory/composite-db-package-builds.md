---
name: Composite @workspace/db declaration builds
description: Why adding a new table to lib/db can typecheck clean in db but fail in api-server, and how to fix it.
---

After adding a new schema file/table to `lib/db` and exporting it from `lib/db/src/schema/index.ts`, the runtime (tsx) and the db package's own typecheck both pass, but consuming packages (e.g. `@workspace/api-server`) fail typecheck with `Module '"@workspace/db"' has no exported member 'XTable'`.

**Why:** `lib/db` is a TypeScript *composite* project (`composite: true`, `emitDeclarationOnly: true`, `outDir: dist`). Consumers resolve `@workspace/db` types from the emitted `lib/db/dist/**/*.d.ts`, NOT from `src`. Those `.d.ts` files are stale until rebuilt. Clearing `tsconfig.tsbuildinfo` alone does NOT fix it because `tsc --noEmit` in the consumer won't emit referenced projects' declarations.

**How to apply:** After changing `lib/db` schema, regenerate declarations before relying on consumer typecheck:
`pnpm exec tsc --build lib/db/tsconfig.json`
Confirm the new `lib/db/dist/schema/<file>.d.ts` exists, then re-run the consumer typecheck.
