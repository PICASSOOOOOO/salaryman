---
name: Composite workspace-library declarations
description: Consumer packages typecheck against emitted declarations from composite libraries, which can be stale after source exports change.
---

Composite workspace libraries can pass their own source-level checks while a consuming package reports that a newly exported symbol does not exist. Runtime tests may still pass because the test runner resolves source files, while TypeScript consumers read generated declaration files.

**Why:** Composite projects emit declarations into `dist`, and project references do not guarantee that a consumer's `tsc --noEmit` refreshes those declarations first.

**How to apply:** After changing exports or schemas in a referenced library, rebuild the workspace libraries before typechecking consumers: `pnpm run typecheck:libs`. For a single library, `pnpm exec tsc --build <library>/tsconfig.json` also refreshes its declarations.
